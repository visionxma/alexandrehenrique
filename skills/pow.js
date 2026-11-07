/* Prova de trabalho (anti-robô sem conta nem chave): acha um número que faz SHA-256(desafio:número) começar com `bits` zeros.
   Roda num Web Worker para não travar a página. API: window.resolverDesafio(desafio, bits) -> Promise<string>. */
(() => {
  const codigoWorker = `
    const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const W = new Uint32Array(64), H = new Uint32Array(8);
    // sha256 sobre buffer já preenchido (p, com o padding pronto, "blocos" blocos de 64 bytes); sem alocar nada por tentativa
    function bloco(dv, blocos) {
      H[0]=0x6a09e667;H[1]=0xbb67ae85;H[2]=0x3c6ef372;H[3]=0xa54ff53a;H[4]=0x510e527f;H[5]=0x9b05688c;H[6]=0x1f83d9ab;H[7]=0x5be0cd19;
      for (let o = 0; o < blocos * 64; o += 64) {
        for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
        for (let i = 16; i < 64; i++) { const x = W[i-15], y = W[i-2]; W[i] = (W[i-16] + (((x>>>7)|(x<<25)) ^ ((x>>>18)|(x<<14)) ^ (x>>>3)) + W[i-7] + (((y>>>17)|(y<<15)) ^ ((y>>>19)|(y<<13)) ^ (y>>>10))) | 0; }
        let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
        for (let i = 0; i < 64; i++) {
          const t1 = (h + (((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
          const t2 = ((((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0]+=a;H[1]+=b;H[2]+=c;H[3]+=d;H[4]+=e;H[5]+=f;H[6]+=g;H[7]+=h;
      }
    }
    function zeros(bits) { let n = 0; for (let i = 0; i < 8; i++) { const z = H[i] === 0 ? 32 : Math.clz32(H[i]); n += z; if (z < 32 || n >= bits) break; } return n >= bits; }
    onmessage = (e) => {
      const { desafio, bits } = e.data, enc = new TextEncoder(), pre = enc.encode(desafio + ':');
      for (let n = 0; ; n++) {
        const num = enc.encode(String(n)), len = pre.length + num.length, blocos = ((len + 9 + 63) >> 6);
        const buf = bufs[blocos] || (bufs[blocos] = { p: new Uint8Array(blocos * 64), dv: null });
        if (!buf.dv) buf.dv = new DataView(buf.p.buffer);
        const p = buf.p; p.fill(0, len); p.set(pre, 0); p.set(num, pre.length); p[len] = 0x80;
        buf.dv.setUint32(blocos * 64 - 8, Math.floor((len * 8) / 4294967296)); buf.dv.setUint32(blocos * 64 - 4, (len * 8) >>> 0);
        bloco(buf.dv, blocos);
        if (zeros(bits)) { postMessage(String(n)); return; }
      }
    };
    const bufs = {};`;
  window.resolverDesafio = (desafio, bits) => new Promise((ok, falha) => {
    try {
      const url = URL.createObjectURL(new Blob([codigoWorker], { type: 'text/javascript' })), w = new Worker(url);
      w.onmessage = (e) => { ok(e.data); w.terminate(); URL.revokeObjectURL(url); };
      w.onerror = (e) => { falha(e); w.terminate(); };
      w.postMessage({ desafio, bits });
    } catch (e) { falha(e); }
  });
})();
