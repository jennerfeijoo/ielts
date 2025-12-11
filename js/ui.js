document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("practiceForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const selectedAreas = Array.from(document.querySelectorAll("input[name='areas']:checked"))
      .map((cb) => cb.value);
    const selectedTypes = Array.from(document.querySelectorAll("input[name='types']:checked"))
      .map((cb) => cb.value);

    if (!selectedAreas.length) {
      alert("Selecciona al menos un área temática.");
      return;
    }
    if (!selectedTypes.length) {
      alert("Selecciona al menos un tipo de tarjeta.");
      return;
    }

    localStorage.setItem("selectedAreas", JSON.stringify(selectedAreas));
    localStorage.setItem("selectedTypes", JSON.stringify(selectedTypes));

    window.location.href = "study.html";
  });
});
