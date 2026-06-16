// Jednoduchá pamäťová cache pre dáta stránok.
// Drží posledné načítané dáta počas behu appky (medzi prepínaním záložiek),
// takže pri návrate na záložku sa hneď ukáže posledný stav a na pozadí sa
// dáta potichu obnovia – bez bliknutia prázdnej obrazovky.
//
// Pozn.: cache je len v pamäti (RAM). Po tvrdom obnovení stránky sa vyprázdni,
// čo je v poriadku – ide nám o plynulé prepínanie počas používania.

const store = new Map<string, unknown>();

export function getCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCache<T>(key: string, value: T): void {
  store.set(key, value);
}

export function hasCache(key: string): boolean {
  return store.has(key);
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
