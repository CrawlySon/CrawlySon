import type { PigMood } from "./mood";

// Ambientná hláška Rypáka na hero karte „Dnes“ – bez AI, zo šablón podľa
// nálady a osobnosti. Vyberá sa deterministicky podľa dátumu, nech sa pri
// každom prekreslení nemení. Skutočné AI hlášky prídu z bublín a výkazov.
type Persona = "nice" | "normal" | "roast";

const LINES: Record<PigMood, Record<Persona, string[]>> = {
  sleeping: {
    nice: ["Dobré ráno! Čo si mal na raňajky?", "Prázdny denník. Napíš mi, čo si jedol, a začneme."],
    normal: ["Nič tu nie je. Buď si nejedol, alebo zatajuješ.", "Denník prázdny. Rypák čaká. Rypák nie je trpezlivý."],
    roast: ["Prázdno. Buď držíš hladovku, alebo si zbabelec. Zapíš to.", "Nič nezapísané. Mlčanie je tiež priznanie, bravček."],
  },
  content: {
    nice: ["Ide ti to pekne, len tak ďalej.", "Deň vyzerá dobre. Telo ti ďakuje."],
    normal: ["Zatiaľ v poriadku. Zatiaľ.", "Nič na komentár. To sa ti často nestáva."],
    roast: ["Zatiaľ nemám čo vytknúť. Nezvykaj si.", "V limite. Rypák je podozrivo ticho."],
  },
  suspicious: {
    nice: ["Blížiš sa k limitu – večeru radšej ľahšiu.", "Ešte to ide, ale pozor na zvyšok dňa."],
    normal: ["Hmm. Sledujem ťa.", "Ešte si v limite. Kľúčové slovo: ešte."],
    roast: ["Rypák dvíha obočie. Ty vieš prečo.", "Ešte jedno sladké a budem mať čo povedať."],
  },
  disgusted: {
    nice: ["Dnes to nevyšlo, zajtra je nový deň.", "Nad cieľom. Nič sa nedeje, len to vedz."],
    normal: ["Nad cieľom. Kalórie sa ti nestratia, aj keď na ne zabudneš.", "Limit prekročený. Rypák si to zapísal."],
    roast: ["Nad cieľom, ty pažravý pampúšik. Rypák si to pamätá.", "Limit je limit, nie odporúčanie."],
  },
  shocked: {
    nice: ["To bol veľký deň. Zajtra ľahšie, dobre?", "Fíha. Veľa naraz. Zajtra sa to vyrovná."],
    normal: ["Toľko naraz? Rypák potrebuje chvíľu.", "To nebolo jedlo, to bol nálet."],
    roast: ["Rypák je v šoku a Rypák je prasa.", "To nebolo jedlo, to bol útok na deficit."],
  },
  proud: {
    nice: ["Paráda! Toto si zaslúži potlesk.", "Rekord! Som na teba hrdý."],
    normal: ["Rekord. Rypák uznanlivo kývol.", "Nový odznak. Nechaj si ho zarámovať."],
    roast: ["Rekord. Rypák neverí, ale čísla sú čísla.", "Odznak. Aj slepé prasa nájde žaluď."],
  },
  savage: {
    nice: ["Bez servítky je zapnuté.", "Rypák si nasadil okuliare."],
    normal: ["Bez servítky. Rypák vidí aj váhu.", "Okuliare nasadené. Čísla nepustia."],
    roast: ["Bez servítky. Rypák číta tvoju váhu ako noviny.", "Okuliare na nose, váha v hľadáčiku."],
  },
};

export function ambientLine(mood: PigMood, persona: Persona, seed: string): string {
  const pool = LINES[mood][persona];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}
