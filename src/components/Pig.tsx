import type { PigMood } from "@/lib/mood";

// Maskot Rypák – jeden SVG, sedem tvárí. Telo (hlava, uši, rypák, líca) je
// spoločné, podľa nálady sa menia oči, obočie a ústa. Farby idú z tokenov
// (--pig, --pig-deep, --ink, --paper), takže funguje v svetlom aj tmavom režime.
// Veľkosť sa riadi šírkou; výška je 0,9× (viewBox 200×180).
export type PigProps = {
  mood?: PigMood;
  size?: number;
  className?: string;
  // „dýchanie“ a žmurkanie – vypne sa pri prefers-reduced-motion cez CSS
  animated?: boolean;
  title?: string;
};

export default function Pig({ mood = "content", size = 96, className = "", animated = true, title }: PigProps) {
  const ink = "var(--ink)";
  const pig = "var(--pig)";
  const deep = "var(--pig-deep)";
  const blush = "var(--pig-blush)";
  const stroke = "var(--pig-stroke)";
  const h = Math.round(size * 0.9);

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 200 180"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={`pig pig--${mood} ${animated ? "pig--animated" : ""} ${className}`}
    >
      {title && <title>{title}</title>}
      {/* uši (za hlavou) */}
      <path d="M44 74 C28 46, 44 14, 74 30 L86 56 Z" fill={pig} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      <path d="M156 74 C172 46, 156 14, 126 30 L114 56 Z" fill={pig} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      <path d="M52 64 C44 46, 54 30, 70 40 L76 56 Z" fill={deep} />
      <path d="M148 64 C156 46, 146 30, 130 40 L124 56 Z" fill={deep} />
      {/* hlava */}
      <g className="pig__head">
        <ellipse cx="100" cy="100" rx="70" ry="62" fill={pig} stroke={stroke} strokeWidth="3" />
        <circle cx="50" cy="114" r="9" fill={blush} />
        <circle cx="150" cy="114" r="9" fill={blush} />
        <Face mood={mood} ink={ink} pig={pig} />
        {/* rypák */}
        <ellipse cx="100" cy="124" rx="28" ry="19" fill={deep} stroke={stroke} strokeWidth="3" />
        <ellipse cx="90" cy="124" rx="4.5" ry="6.5" fill={ink} />
        <ellipse cx="110" cy="124" rx="4.5" ry="6.5" fill={ink} />
        <Mouth mood={mood} ink={ink} />
      </g>
      <Extras mood={mood} ink={ink} />
    </svg>
  );
}

function Face({ mood, ink, pig }: { mood: PigMood; ink: string; pig: string }) {
  switch (mood) {
    case "content":
    case "proud":
      return (
        <>
          <path d="M66 92 Q74 84 82 92" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M118 92 Q126 84 134 92" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M62 74 Q74 68 86 74" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M138 74 Q126 68 114 74" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "suspicious":
      return (
        <>
          <g className="pig__eyes">
            <circle cx="74" cy="90" r="7" fill={ink} />
            <circle cx="126" cy="90" r="7" fill={ink} />
            <circle cx="76.5" cy="87.5" r="2.2" fill="#fff" />
            <circle cx="128.5" cy="87.5" r="2.2" fill="#fff" />
          </g>
          <path d="M64 80 H84 V86 H64 Z" fill={pig} />
          <path d="M116 80 H136 V86 H116 Z" fill={pig} />
          <path d="M65 86 L83 86" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M117 86 L135 86" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M60 70 Q74 60 88 68" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M140 76 L116 78" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "disgusted":
      return (
        <>
          <ellipse cx="74" cy="91" rx="7" ry="3.5" fill={ink} />
          <ellipse cx="126" cy="91" rx="7" ry="3.5" fill={ink} />
          <path d="M60 70 L88 80" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M140 70 L112 80" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "shocked":
      return (
        <>
          <g className="pig__eyes">
            <circle cx="74" cy="90" r="9.5" fill={ink} />
            <circle cx="126" cy="90" r="9.5" fill={ink} />
            <circle cx="77.5" cy="86.5" r="3" fill="#fff" />
            <circle cx="129.5" cy="86.5" r="3" fill="#fff" />
          </g>
          <path d="M60 64 Q74 54 88 62" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M140 64 Q126 54 112 62" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "sleeping":
      return (
        <>
          <path d="M66 92 L82 92" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M118 92 L134 92" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "savage":
      return (
        <>
          <rect x="54" y="78" width="38" height="24" rx="8" fill={ink} />
          <rect x="108" y="78" width="38" height="24" rx="8" fill={ink} />
          <path d="M92 88 L108 88" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <path d="M54 86 L42 80" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M146 86 L158 80" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M62 85 L74 85" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
          <path d="M116 85 L128 85" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
        </>
      );
  }
}

function Mouth({ mood, ink }: { mood: PigMood; ink: string }) {
  switch (mood) {
    case "content":
      return <path d="M80 148 Q100 162 120 148" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
    case "proud":
      return <path d="M74 146 Q100 174 126 146 Z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round" />;
    case "suspicious":
      return <path d="M84 153 L116 153" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
    case "disgusted":
      return <path d="M82 158 Q100 144 118 158" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
    case "shocked":
      return <ellipse cx="100" cy="155" rx="9" ry="11" fill={ink} />;
    case "sleeping":
      return <path d="M92 152 L108 152" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
    case "savage":
      return <path d="M80 152 Q104 164 122 148" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
  }
}

function Extras({ mood, ink }: { mood: PigMood; ink: string }) {
  if (mood === "sleeping") {
    return (
      <g className="pig__zzz" fill={ink} fontFamily="var(--font-display), sans-serif" fontWeight="900">
        <text x="150" y="44" fontSize="22">z</text>
        <text x="166" y="30" fontSize="16">z</text>
        <text x="178" y="18" fontSize="11">z</text>
      </g>
    );
  }
  if (mood === "proud") {
    return (
      <g fill="var(--warn)">
        <path d="M30 28 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" />
        <path d="M172 20 l2.5 6.5 l6.5 2.5 l-6.5 2.5 l-2.5 6.5 l-2.5 -6.5 l-6.5 -2.5 l6.5 -2.5 z" />
      </g>
    );
  }
  if (mood === "shocked") {
    return <path d="M166 62 C160 72, 158 80, 166 84 C174 80, 172 72, 166 62 Z" fill="#9EC9F2" stroke={ink} strokeWidth="2" />;
  }
  return null;
}
