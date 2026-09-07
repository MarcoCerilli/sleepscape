import { EMPTY_MIX } from "./scenarios";
import type { Mix } from "./types";

export function mixFromPrompt(input: string): Mix {
  const text = input.toLowerCase();
  const mix: Mix = { ...EMPTY_MIX };

  const add = (key: keyof Mix, value: number) => {
    mix[key] = Math.min(100, Math.max(mix[key] || 0, value));
  };

  // Casa, phon, scaldino e relax
  if (/phon|asciugacapelli|capelli/.test(text)) add("hairdryer", 68);
  if (/scaldino|caldobagno|termoventilatore|stufetta|stufa|caldo in doccia/.test(text)) add("heater", 70);
  if (/bagno|doccia/.test(text)) {
    add("heater", 55);
    if (!/no phon/.test(text)) add("hairdryer", 35);
  }

  // Neve, bufera e baita
  if (/neve|nevica|bufera|blizzard|ghiaccio|inverno|gelo/.test(text)) {
    add("snow", 55);
    add("wind", 25);
  }
  if (/camino|fuoco|baita|chalet|rifugio|legna|ciocchi/.test(text)) {
    add("fire", 65);
  }

  // Temporale e meteo
  if (/tuono|tuoni|fulmin|lamp|temporale/.test(text)) {
    add("thunder", 58);
    add("rain", 70);
    add("wind", 30);
  } else if (/pioggia|piove|acqua|gocce/.test(text)) {
    add("rain", /forte|battente/.test(text) ? 75 : 48);
  }

  if (/vento|brezza|aria|folate/.test(text)) {
    add("wind", /forte|bufera/.test(text) ? 45 : 24);
  }

  // Animali & relax intimo
  if (/gatto|micio|fusa|gattino|purr/.test(text)) {
    add("catPurr", 72);
  }

  // Orologio
  if (/orologio|ticchettio|tic tac|pendolo|lancette/.test(text)) {
    add("clock", 52);
  }

  // Natura & acqua
  if (/ruscello|torrente|fiume|fiumiciattolo|sorgente|cascatella/.test(text)) {
    add("stream", 64);
  }
  if (/mare|spiaggia|onde|oceano|costa|battigia/.test(text)) {
    add("waves", 72);
  }
  if (/bosco|foresta|uccelli|natura|foglie|alberi/.test(text)) {
    add("forest", 52);
  }

  // Treno e viaggio
  if (/treno|viaggio|vagone|binari|rotaie/.test(text)) {
    add("train", 66);
  }

  // Notte & suoni continui
  if (/notte|stelle|notturn|grilli|cicale/.test(text)) {
    add("night", 40);
  }
  if (/rumore bruno|rumore bianco|profondo|continuo|insonor|isolamento/.test(text)) {
    add("brownNoise", 68);
  }

  const hasAny = Object.values(mix).some((value) => value > 0);
  if (!hasAny) {
    mix.brownNoise = 50;
    mix.night = 25;
    mix.wind = 15;
  }

  return mix;
}
