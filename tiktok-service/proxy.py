import os


def get_proxy_provider():
    provider_type = os.environ.get("PROXY_PROVIDER", "none")

    if provider_type == "none" or not provider_type:
        return None

    api_key = os.environ.get("PROXY_API_KEY")
    if not api_key:
        raise ValueError("PROXY_API_KEY is required when PROXY_PROVIDER is set")

    if provider_type == "webshare":
        from proxyproviders import Webshare
        return Webshare(api_key=api_key)

    raise ValueError(f"Unknown proxy provider: {provider_type}")
