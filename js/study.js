let cards = [];
let index = 0;

const frontEl = () => document.getElementById("frontText");
const backList = () => document.getElementById("backList");
const examplesBox = () => document.getElementById("examplesBox");
const flipCardEl = () => document.getElementById("flipCard");
const counterEl = () => document.getElementById("counter");
const progressEl = () => document.getElementById("progressBar");
const tagEl = () => document.getElementById("cardTag");

function updateProgress() {
  counterEl().textContent = `${index + 1} / ${cards.length}`;
  progressEl().style.width = `${((index + 1) / cards.length) * 100}%`;
}

function renderCard() {
  if (!cards.length) {
    frontEl().textContent = "No se encontraron tarjetas con la configuración seleccionada.";
    backList().innerHTML = "";
    tagEl().textContent = "";
    examplesBox().classList.add("hidden");
    counterEl().textContent = "0 / 0";
    progressEl().style.width = "0%";
    return;
  }

  const card = cards[index];
  frontEl().textContent = card.front;
  tagEl().textContent = `${card.type} · ${card.area}`;

  const ul = backList();
  ul.innerHTML = "";
  card.back.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });

  const ex = examplesBox();
  ex.innerHTML = card.examples.map((e) => `<p>• ${e}</p>`).join("");
  ex.classList.add("hidden");

  flipCardEl().classList.remove("flipped");
  updateProgress();
}

function nextCard() {
  if (!cards.length) return;
  index = (index + 1) % cards.length;
  renderCard();
}

function shuffleCards() {
  cards = window.cardLoader.shuffle(cards);
  index = 0;
  renderCard();
}

async function init() {
  try {
    cards = await window.cardLoader.loadSelectedCards();
    if (!cards.length) {
      renderCard();
      return;
    }
    shuffleCards();
  } catch (err) {
    console.error(err);
    frontEl().textContent = "Error al cargar los archivos de tarjetas.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("flipBtn").addEventListener("click", () => {
    flipCardEl().classList.toggle("flipped");
  });

  document.getElementById("examplesBtn").addEventListener("click", () => {
    examplesBox().classList.toggle("hidden");
  });

  document.getElementById("nextBtn").addEventListener("click", nextCard);
  document.getElementById("shuffleBtn").addEventListener("click", shuffleCards);
  document.getElementById("restartBtn").addEventListener("click", () => {
    index = 0;
    renderCard();
  });

  init();
});
