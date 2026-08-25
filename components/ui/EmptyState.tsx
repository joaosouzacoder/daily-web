// Uma tela vazia é um convite à ação, nunca um espaço em branco: cada
// painel passa uma mensagem específica do seu contexto.
export function EmptyState({ message }: { message: string }) {
  return <p className="empty">{message}</p>;
}
