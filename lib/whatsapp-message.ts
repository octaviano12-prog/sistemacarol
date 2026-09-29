export const DEFAULT_CONFIRMATION_MESSAGE = `Olá, {nome}! Tudo bem?

Gostaria de confirmar seu atendimento de {quando}, dia {data}, às {horario}.
Podemos confirmar?

⚠️ Pedimos que a confirmação seja realizada com até 6h de antecedência do horário agendado.

Caso não haja confirmação dentro desse prazo, o horário será automaticamente cancelado e disponibilizado para outro paciente. 😀`;

export function upgradeConfirmationMessage(template?: string | null) {
  const message = template?.trim() || DEFAULT_CONFIRMATION_MESSAGE;
  if (message.includes("{quando}")) return message;

  return message
    .replace("seu atendimento no dia {data} às", "seu atendimento de {quando}, dia {data}, às")
    .replace("seu atendimento no dia {data}", "seu atendimento de {quando}, dia {data}");
}

export function appointmentWhen(scheduledAt: string, referenceDate = new Date()) {
  const appointmentDate = scheduledAt.slice(0, 10);
  const [year, month, day] = appointmentDate.split("-").map(Number);
  if (!year || !month || !day) return "";

  const referenceDay = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const scheduledDay = Date.UTC(year, month - 1, day);
  const dayDifference = Math.round((scheduledDay - referenceDay) / 86_400_000);

  if (dayDifference === 0) return "hoje";
  if (dayDifference === 1) return "amanhã";

  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(year, month - 1, day, 12));
}

export function formatConfirmationMessage(template: string, values: { name: string; date: string; time: string; duration: string; when: string }) {
  return upgradeConfirmationMessage(template)
    .replaceAll("{nome}", values.name)
    .replaceAll("{data}", values.date)
    .replaceAll("{horario}", values.time)
    .replaceAll("{duracao}", values.duration)
    .replaceAll("{quando}", values.when);
}
