declare global {
  interface BigInt {
    toJSON(): number;
  }
}

if (typeof BigInt.prototype.toJSON !== "function") {
  BigInt.prototype.toJSON = function toJSON() {
    return Number(this);
  };
}

export {};
