let cards = [];
let index = 0;

document.addEventListener("DOMContentLoaded", async () => {
    const areas = JSON.parse(localStorage.getItem("selectedAreas") || "[]");
    const types = JSON.parse(localStorage.getItem("selectedTypes") || "[]");

    cards = await loadCards(areas);
    cards = cards.filter(c => types.includes(c.type));

    shuffle(cards);

    showCard();
});

function showCard() {
    const card = cards[index];

    document.getElementById("cardFront").innerText = card.front;
    document.getElementById("cardBack").innerText = card.back;
    document.getElementById("cardBack").classList.add("hidden");

    document.getElementById("showAnswer").classList.remove("hidden");
    document.getElementById("nextCard").classList.add("hidden");

    const examplesContainer = document.getElementById("examplesContainer");
    const examplesList = document.getElementById("examplesList");
    examplesList.innerHTML = "";
    card.examples.forEach(e => {
        const li = document.createElement("li");
        li.innerText = e;
        examplesList.appendChild(li);
    });
    examplesContainer.classList.add("hidden");
}

document.getElementById("showAnswer").onclick = () => {
    document.getElementById("cardBack").classList.remove("hidden");
    document.getElementById("nextCard").classList.remove("hidden");
    document.getElementById("showAnswer").classList.add("hidden");

    document.getElementById("examplesContainer").classList.remove("hidden");
};

document.getElementById("nextCard").onclick = () => {
    index++;
    if (index >= cards.length) index = 0;
    showCard();
};

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}
