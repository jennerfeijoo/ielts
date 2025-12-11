document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("practiceForm");

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const selectedAreas = Array.from(document.querySelectorAll("input[name='areas']:checked"))
            .map(cb => cb.value);

        const selectedTypes = Array.from(document.querySelectorAll("input[name='types']:checked"))
            .map(cb => cb.value);

        localStorage.setItem("selectedAreas", JSON.stringify(selectedAreas));
        localStorage.setItem("selectedTypes", JSON.stringify(selectedTypes));

        window.location.href = "study.html";
    });
});
