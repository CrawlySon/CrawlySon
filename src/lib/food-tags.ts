// Rozpoznávanie druhov jedla/nápoja z názvu a kategórie záznamu.
// Zámerne bez závislosti na DB, nech to vie použiť aj séria odznakov (coach.ts),
// aj filtre v analytike – inak by každé miesto rozpoznávalo alkohol inak.

// Akýkoľvek alkohol (pivo, víno, tvrdý).
export const ALCOHOL_RX =
  /alkohol|\bpiv(o|a|om|e)\b|ležiak|lezia|radler|\bvín(o|a|om|e)\b|\bvin(o|a)\b|prosecco|šampan|sampan|\bsekt\b|vodk|whisk|\brum\b|\bgin\b|tequil|likér|liker|borovičk|borovick|slivovic|hruškovic|hruskovic|brandy|koňak|konak|cognac|aperol|spritz|mojito|jäger|jager|absint|metax|becher|fernet|\bcider\b|martini|campari|baileys|\bpálenk|palenk/i;

// Tvrdý alkohol (destiláty) – pivo a víno tu NIE SÚ.
export const HARD_ALCOHOL_RX =
  /vodk|whisk|\brum\b|\bgin\b|tequil|likér|liker|borovičk|borovick|slivovic|hruškovic|hruskovic|brandy|koňak|konak|cognac|aperol|spritz|mojito|jäger|jager|absint|metax|becher|fernet|martini|campari|baileys|\bpálenk|palenk/i;

// Nápoje: hlavný signál je AI kategória „Nápoje", názvy sú poistka pre záznamy
// zaradené inam. Alkohol tu zámerne NIE JE – má vlastný, samostatný filter.
const DRINK_CAT_RX = /nápoj|napoj/i;
const DRINK_NAME_RX =
  /\bkáva\b|\bkava\b|espresso|presso|lungo|luongo|cappuccino|kapučín|latte|\bčaj\b|\bcaj\b|džús|dzus|\bjuice\b|\bkola\b|\bcola\b|limonád|limonad|malinovk|smoothie|energet|\btonic\b|\bsóda\b|\bsoda\b|kakao/i;

export type TaggableEntry = {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

// Spojený text, v ktorom hľadáme – kategória, podkategória aj názov.
function blobOf(e: TaggableEntry): string {
  return `${e.category || ""} ${e.subcategory || ""} ${e.name || ""}`;
}

export function isAlcohol(e: TaggableEntry): boolean {
  return ALCOHOL_RX.test(blobOf(e));
}

export function isHardAlcohol(e: TaggableEntry): boolean {
  return HARD_ALCOHOL_RX.test(blobOf(e));
}

export function isDrink(e: TaggableEntry): boolean {
  if (e.category && DRINK_CAT_RX.test(e.category)) return true;
  return DRINK_NAME_RX.test(blobOf(e));
}
