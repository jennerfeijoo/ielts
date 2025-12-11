let cards = [];
let index = 0;

document.addEventListener("DOMContentLoaded", async () => {
  cards = await loadSelectedCards();
  renderCard();
});

function renderCard(){
  const card = cards[index];

  document.getElementById("frontText").textContent = card.front;

  const ul = document.getElementById("backList");
  ul.innerHTML = "";
  card.back.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.trim();
    ul.appendChild(li);
  });

  const ex = document.getElementById("examplesBox");
  ex.innerHTML = card.examples.map(e => `<p>• ${e}</p>`).join("");
  ex.classList.add("hidden");
}

document.getElementById("flipBtn").onclick = () => {
  document.getElementById("flipCard").classList.toggle("flipped");
};

document.getElementById("examplesBtn").onclick = () => {
  document.getElementById("examplesBox").classList.toggle("hidden");
};

document.getElementById("nextBtn").onclick = () => {
  index = (index + 1) % cards.length;
  document.getElementById("flipCard").classList.remove("flipped");
  renderCard();
};

