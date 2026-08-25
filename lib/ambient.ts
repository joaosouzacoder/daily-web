export interface AmbientColors {
  top: string;
  bottom: string;
}

// O fundo da página é um segundo relógio: o matiz percorre um arco ao longo
// do dia (violeta frio na madrugada -> rosado quente ao meio-dia -> violeta
// frio de novo à noite) e a opacidade sobe durante uma sessão de foco.
// Puro de propósito: a hora entra como argumento para ser testável.
export function ambientForHour(hour: number, focusing: boolean): AmbientColors {
  const t = (hour % 24) / 24;
  const hue = Math.round(258 + 60 * Math.sin(Math.PI * t));
  const alphaTop = focusing ? 0.22 : 0.1;
  const alphaBottom = focusing ? 0.14 : 0.06;
  return {
    top: `hsl(${hue} 70% 55% / ${alphaTop})`,
    bottom: `hsl(${hue - 30} 65% 45% / ${alphaBottom})`,
  };
}
