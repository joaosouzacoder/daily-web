// CLI de usuários do daily-web. Roda com `npm run users -- <comando>`.
// Vai por vite-node com o vitest.config porque é ele que conhece o alias `@/`
// usado por lib/ — o Node puro não resolve o alias, e trocá-lo por caminho
// relativo aqui quebraria a convenção do resto do projeto.
// A tela de gestão chega no estágio 4 do multiusuário; até lá, é por aqui que
// se cadastra alguém.
import {
  createUser,
  listUsers,
  removeUser,
  setUserPassword,
} from '@/lib/auth/users';

const USAGE = `uso:
  npm run users -- list
  npm run users -- add <username> <senha> [--admin]
  npm run users -- password <username> <nova-senha>
  npm run users -- remove <username>`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list': {
    const users = listUsers();
    if (users.length === 0) {
      console.log('nenhum usuário cadastrado');
      break;
    }
    for (const user of users) {
      console.log(`${user.username}${user.isAdmin ? ' (admin)' : ''}\t${user.id}`);
    }
    break;
  }
  case 'add': {
    const [username, password] = args;
    if (!username || !password) fail(USAGE);
    const user = await createUser(username, password, args.includes('--admin'));
    console.log(`criado: ${user.username} (${user.id})`);
    break;
  }
  case 'password': {
    const [username, password] = args;
    if (!username || !password) fail(USAGE);
    if (!(await setUserPassword(username, password))) fail(`usuário ${username} não encontrado`);
    console.log(`senha trocada: ${username}`);
    break;
  }
  case 'remove': {
    const [username] = args;
    if (!username) fail(USAGE);
    if (!removeUser(username)) fail(`usuário ${username} não encontrado`);
    console.log(`removido: ${username}`);
    break;
  }
  default:
    fail(USAGE);
}
