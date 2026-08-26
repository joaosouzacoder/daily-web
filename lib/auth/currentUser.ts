import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_MAX_AGE_MS, SESSION_COOKIE } from './session';
import { findUserById, type User } from './users';

// O middleware já barra quem não tem sessão, mas quem *é* o usuário é
// resolvido aqui dentro do handler, relendo o cookie. A alternativa comum —
// o middleware injetar um header com o id — cria uma superfície de spoof:
// basta um caminho público esquecido para o header forjado passar direto.
export async function getCurrentUser(): Promise<User | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token, secret, SESSION_MAX_AGE_MS);
  if (!payload) return null;
  return findUserById(payload.userId);
}
