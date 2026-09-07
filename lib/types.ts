export type SoundId =
  | "waves"
  | "rain"
  | "wind"
  | "fire"
  | "forest"
  | "train"
  | "brownNoise"
  | "night"
  | "hairdryer"
  | "heater"
  | "thunder"
  | "snow"
  | "stream"
  | "catPurr"
  | "clock";

export type Mix = Record<SoundId, number>;

export type Scenario = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  mix: Mix;
};

export type SavedPreset = {
  id: string;
  name: string;
  mix: Mix;
  createdAt: string;
};
