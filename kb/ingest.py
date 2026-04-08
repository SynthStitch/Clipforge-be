"""
ClipForge Knowledge Base Ingestion Script

Reads text files from a content directory, chunks them, embeds via
local Ollama (nomic-embed-text), and stores in Postgres with pgvector.

Usage:
  python ingest.py --content-dir ~/clipforge-knowledge --db-url postgresql://clipforge:pass@10.8.8.147:5432/clipforge

Requirements:
  pip install psycopg2-binary requests tiktoken
"""

import argparse
import json
import os
import re
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "nomic-embed-text"
MAX_TOKENS = 600
OVERLAP_TOKENS = 100

# Map folder names to collection + source_type
FOLDER_MAP = {
    "course": ("coaching_course", "course_module"),
    "meetings": ("meeting_transcripts", "meeting_transcript"),
    "playbooks": ("playbooks", "guide"),
}

# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~0.75 tokens per word for English."""
    return int(len(text.split()) * 1.33)


def smart_chunk(text: str, max_tokens: int = MAX_TOKENS) -> list[str]:
    """Split on natural section boundaries first, then token-window within."""
    # Split on double newlines, markdown headers, or --- separators
    sections = re.split(r'\n{2,}|^#{1,3}\s.+$|^-{3,}$', text, flags=re.MULTILINE)
    sections = [s.strip() for s in sections if s.strip()]

    chunks = []
    buffer = ""

    for section in sections:
        combined = f"{buffer}\n\n{section}".strip() if buffer else section

        if estimate_tokens(combined) <= max_tokens:
            buffer = combined
        else:
            # Flush buffer
            if buffer:
                chunks.append(buffer)
            # If section itself is too large, split by sentences
            if estimate_tokens(section) > max_tokens:
                sentences = re.split(r'(?<=[.!?])\s+', section)
                sub_buf = ""
                for sent in sentences:
                    test = f"{sub_buf} {sent}".strip() if sub_buf else sent
                    if estimate_tokens(test) <= max_tokens:
                        sub_buf = test
                    else:
                        if sub_buf:
                            chunks.append(sub_buf)
                        sub_buf = sent
                if sub_buf:
                    buffer = sub_buf
                else:
                    buffer = ""
            else:
                buffer = section

    if buffer:
        chunks.append(buffer)

    return chunks


# ---------------------------------------------------------------------------
# Embedding (local Ollama)
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """Get embedding from local Ollama nomic-embed-text."""
    resp = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]


# ---------------------------------------------------------------------------
# Auto-tagging via simple keyword matching
# ---------------------------------------------------------------------------

TAG_KEYWORDS = {
    "hooks": ["hook", "scroll stop", "pattern interrupt", "attention", "opening"],
    "objections": ["objection", "doubt", "skeptic", "trust", "credibility"],
    "tiktok_shop": ["tiktok shop", "gmv", "affiliate", "commission", "shop tab"],
    "meta_ads": ["meta", "facebook", "instagram", "ad spend", "roas", "cpm"],
    "ugc": ["ugc", "user generated", "creator content", "testimonial video"],
    "pricing": ["price", "pricing", "discount", "flash sale", "cost", "margin"],
    "niches": ["niche", "category", "vertical", "market", "segment"],
    "scaling": ["scale", "scaling", "growth", "expand", "volume"],
    "content_structure": ["structure", "script", "framework", "template", "format"],
    "audience": ["audience", "viewer", "demographic", "target", "persona"],
    "analytics": ["analytics", "metric", "data", "performance", "engagement"],
}


def auto_tag(text: str) -> list[str]:
    """Extract topic tags from chunk content via keyword matching."""
    lower = text.lower()
    tags = []
    for tag, keywords in TAG_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            tags.append(tag)
    return tags[:4]  # Max 4 tags per chunk


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def insert_source(cur, collection: str, title: str, source_type: str,
                  filename: str, total_chunks: int) -> str:
    source_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO knowledge_sources (id, collection, title, source_type, original_filename, total_chunks)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (source_id, collection, title, source_type, filename, total_chunks))
    return source_id


def insert_chunks(cur, chunks_data: list[dict]):
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO knowledge_chunks
            (id, source_id, chunk_index, content, embedding, collection, topic_tags, content_type)
        VALUES %s
        """,
        [
            (
                str(uuid.uuid4()),
                c["source_id"],
                c["chunk_index"],
                c["content"],
                c["embedding"],
                c["collection"],
                c["topic_tags"],
                c["content_type"],
            )
            for c in chunks_data
        ],
        template="(%s, %s, %s, %s, %s::vector, %s, %s, %s)",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_file(filepath: Path, collection: str, source_type: str) -> list[dict]:
    """Read, chunk, embed, and return chunk records for one file."""
    text = filepath.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        print(f"  SKIP (empty): {filepath.name}")
        return []

    title = filepath.stem.replace("-", " ").replace("_", " ").title()
    chunks = smart_chunk(text)
    print(f"  {filepath.name} → {len(chunks)} chunks")

    records = []
    for i, chunk in enumerate(chunks):
        embedding = embed_text(chunk)
        tags = auto_tag(chunk)
        records.append({
            "source_id": None,  # filled after source insert
            "chunk_index": i,
            "content": chunk,
            "embedding": json.dumps(embedding),
            "collection": collection,
            "topic_tags": tags,
            "content_type": source_type.replace("_", " "),
        })

    return records


def main():
    parser = argparse.ArgumentParser(description="Ingest coaching content into ClipForge KB")
    parser.add_argument("--content-dir", required=True, help="Path to clipforge-knowledge folder")
    parser.add_argument("--db-url", required=True, help="PostgreSQL connection string")
    parser.add_argument("--ollama-url", default=OLLAMA_URL, help="Ollama API URL")
    parser.add_argument("--wipe", action="store_true", help="Drop and recreate all KB data before ingesting")
    args = parser.parse_args()

    global OLLAMA_URL
    OLLAMA_URL = args.ollama_url

    content_dir = Path(args.content_dir)
    if not content_dir.exists():
        print(f"Content directory not found: {content_dir}")
        return

    conn = psycopg2.connect(args.db_url)
    cur = conn.cursor()

    if args.wipe:
        print("Wiping existing KB data...")
        cur.execute("DELETE FROM knowledge_chunks")
        cur.execute("DELETE FROM knowledge_sources")
        conn.commit()

    for folder_name, (collection, source_type) in FOLDER_MAP.items():
        folder = content_dir / folder_name
        if not folder.exists():
            print(f"Folder not found, skipping: {folder}")
            continue

        txt_files = sorted(folder.glob("*.txt"))
        if not txt_files:
            print(f"No .txt files in {folder}, skipping")
            continue

        print(f"\n{'='*60}")
        print(f"Collection: {collection} ({len(txt_files)} files)")
        print(f"{'='*60}")

        for filepath in txt_files:
            records = process_file(filepath, collection, source_type)
            if not records:
                continue

            # Insert source
            source_id = insert_source(
                cur, collection,
                title=filepath.stem.replace("-", " ").replace("_", " ").title(),
                source_type=source_type,
                filename=filepath.name,
                total_chunks=len(records),
            )

            # Set source_id on all records
            for r in records:
                r["source_id"] = source_id

            # Insert chunks
            insert_chunks(cur, records)
            conn.commit()

    # Summary
    cur.execute("SELECT COUNT(*) FROM knowledge_sources")
    src_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM knowledge_chunks")
    chunk_count = cur.fetchone()[0]
    print(f"\nDone. {src_count} sources, {chunk_count} chunks in KB.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
