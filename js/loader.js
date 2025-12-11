async function loadFile(area){
  const res = await fetch(`data/${area}.txt`);
  return (await res.text()).trim().split("\n");
}

async function loadSelectedCards(){
  const selected = JSON.parse(localStorage.getItem("selected") || "[]");
  let cards = [];

  for(const area of selected){
    const lines = await loadFile(area);

    for(const l of lines){
      const [type, front, back, examples] = l.split(";");
      cards.push({
        type,
        front,
        back: back.split("/"),
        examples: examples.split("|")
      });
    }
  }

  return cards;
}

