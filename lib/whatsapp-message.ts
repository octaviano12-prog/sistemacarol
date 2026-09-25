export const DEFAULT_CONFIRMATION_MESSAGE = "Olá, {nome}! Tudo bem? Aqui é da Dra. Maria Carolini, fisioterapeuta. Gostaria de confirmar seu atendimento no dia {data} às {horario}. Podemos confirmar?";

export function formatConfirmationMessage(template: string, values: { name: string; date: string; time: string; duration: string }) {
  return (template || DEFAULT_CONFIRMATION_MESSAGE)
    .replaceAll("{nome}", values.name)
    .replaceAll("{data}", values.date)
    .replaceAll("{horario}", values.time)
    .replaceAll("{duracao}", values.duration);
}
