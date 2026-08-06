/** Deterministic xoshiro128** PRNG so runs are reproducible from a seed. */
export class RNG {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0

  constructor(seed: number | string = Date.now()) {
    this.seed(seed)
  }

  seed(seed: number | string): void {
    let h = 0x9e3779b9
    const str = typeof seed === 'number' ? String(seed >>> 0) : seed
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    // splitmix32 expansion
    const next = () => {
      h = (h + 0x9e3779b9) >>> 0
      let z = h
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
      return (z ^ (z >>> 15)) >>> 0
    }
    this.s0 = next(); this.s1 = next(); this.s2 = next(); this.s3 = next()
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1
  }

  /** raw 32-bit */
  u32(): number {
    const r = (Math.imul(this.s1, 5) >>> 0)
    const result = ((((r << 7) | (r >>> 25)) >>> 0) * 9) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0
    return result
  }

  /** [0,1) */
  next(): number { return this.u32() / 4294967296 }

  /** integer in [0,n) */
  int(n: number): number { return n <= 0 ? 0 : this.u32() % n }

  /** integer in [lo,hi] inclusive */
  range(lo: number, hi: number): number { return lo + this.int(hi - lo + 1) }

  chance(p: number): boolean { return this.next() < p }

  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)] }

  /** Weighted pick. `weight` defaults to 1. */
  pickWeighted<T>(arr: readonly T[], weight: (t: T) => number): T {
    let total = 0
    for (const a of arr) total += Math.max(0, weight(a))
    if (total <= 0) return this.pick(arr)
    let r = this.next() * total
    for (const a of arr) {
      r -= Math.max(0, weight(a))
      if (r <= 0) return a
    }
    return arr[arr.length - 1]
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t
    }
    return arr
  }

  /** Pick `n` distinct items (or fewer if the pool is small). */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = arr.slice()
    this.shuffle(copy)
    return copy.slice(0, Math.min(n, copy.length))
  }
}

/** Global RNG for cosmetic randomness (never affects game state). */
export const cosmeticRng = new RNG(1337)
