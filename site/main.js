// Download aponta para a última release; o rótulo segue o SO de quem visita.
const RELEASES = "https://github.com/vitor-galache/notesea/releases/latest";

const ua = navigator.userAgent;
const os = /Mac/.test(ua)
  ? "macOS"
  : /Win/.test(ua)
    ? "Windows"
    : /Linux/.test(ua)
      ? "Linux"
      : null;

const button = document.getElementById("download");
if (button) {
  button.href = RELEASES;
  if (os) button.textContent = `Baixar para ${os}`;
}

// Bolhas decorativas no hero.
const hero = document.querySelector(".hero");
for (let i = 0; hero && i < 14; i++) {
  const b = document.createElement("span");
  const size = 6 + Math.random() * 18;
  b.className = "bubble";
  b.style.width = b.style.height = `${size}px`;
  b.style.left = `${Math.random() * 100}%`;
  b.style.animationDuration = `${8 + Math.random() * 10}s`;
  b.style.animationDelay = `${-Math.random() * 18}s`;
  hero.appendChild(b);
}
