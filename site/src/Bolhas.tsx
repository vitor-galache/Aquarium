// Sorteadas uma vez, ao carregar a página.
const BOLHAS = Array.from({ length: 36 }, () => ({
  size: 6 + Math.random() * 26,
  left: Math.random() * 100,
  duration: 12 + Math.random() * 18,
  delay: -Math.random() * 30,
}));

/** Fundo fixo com bolhas subindo; fica atrás de todas as seções. */
export function Bolhas() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-canvas via-highlight to-foam/60"
    >
      {BOLHAS.map((b, i) => (
        <span
          key={i}
          className="bolha"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.left}%`,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
