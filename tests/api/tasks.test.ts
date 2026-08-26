import { describe, expect, it, vi, beforeEach } from 'vitest';

// As rotas resolvem o usuário pelo cookie; aqui basta um usuário fixo para o
// teste focar no que ele mede.
vi.mock('@/lib/auth/currentUser', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'u-1', username: 'joao', passwordHash: 'x', isAdmin: true, createdAt: '2026-01-01',
  })),
}));

vi.mock('@/lib/cli/mstodo', () => ({
  addTask: vi.fn(async () => 'NEW-ID'),
  editTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  deleteTask: vi.fn(),
  addSubtask: vi.fn(),
  editSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  checkSubtask: vi.fn(),
}));

import { addTask, editTask, completeTask, reopenTask, deleteTask, addSubtask, editSubtask, checkSubtask } from '@/lib/cli/mstodo';
import { POST as createRoute } from '@/app/api/tasks/route';
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/tasks/[id]/route';
import { POST as createSubtaskRoute } from '@/app/api/tasks/[id]/subtasks/route';
import { PATCH as patchSubtaskRoute, DELETE as deleteSubtaskRoute } from '@/app/api/tasks/[id]/subtasks/[itemId]/route';

beforeEach(() => vi.clearAllMocks());

function req(body: unknown): Request {
  return new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
}

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

describe('POST /api/tasks', () => {
  it('título vazio devolve 400 sem chamar addTask', async () => {
    const res = await createRoute(req({ title: '  ' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });

  it('cria a tarefa e edita quando há campos extras', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', due: 'hoje', priority: 'high' }));
    const data = await res.json();
    expect(data.id).toBe('NEW-ID');
    expect(addTask).toHaveBeenCalledWith('u-1', 'Nova tarefa');
    expect(editTask).toHaveBeenCalledWith('u-1', 'NEW-ID', expect.objectContaining({ priority: 'high' }));
  });

  it('data inválida devolve 400 e não cria a tarefa (sem orfão)', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', due: 'não é uma data' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });

  it('prioridade inválida devolve 400 sem chamar addTask', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', priority: 'urgentíssimo' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });

  it('recorrência inválida devolve 400 sem chamar addTask', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', recur: 'a cada hora' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });

  it('título iniciado com "-" devolve 400 sem chamar addTask', async () => {
    const res = await createRoute(req({ title: '-rf tudo' }));
    expect(res.status).toBe(400);
    expect(addTask).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/tasks/[id]', () => {
  it('completed=true chama completeTask', async () => {
    await patchRoute(req({ completed: true }), params({ id: 'T1' }));
    expect(completeTask).toHaveBeenCalledWith('u-1', 'T1');
  });

  it('completed=false chama reopenTask', async () => {
    await patchRoute(req({ completed: false }), params({ id: 'T1' }));
    expect(reopenTask).toHaveBeenCalledWith('u-1', 'T1');
  });

  it('edição de campos chama editTask com a data já parseada', async () => {
    await patchRoute(req({ due: 'amanhã' }), params({ id: 'T1' }));
    expect(editTask).toHaveBeenCalledWith('u-1', 'T1', expect.objectContaining({ due: expect.any(String) }));
  });

  it('id iniciado com "-" devolve 400 sem chamar completeTask/editTask', async () => {
    const res = await patchRoute(req({ completed: true }), params({ id: '-rf' }));
    expect(res.status).toBe(400);
    expect(completeTask).not.toHaveBeenCalled();
    expect(editTask).not.toHaveBeenCalled();
  });

  it('prioridade inválida devolve 400 sem chamar editTask', async () => {
    const res = await patchRoute(req({ priority: 'urgentíssimo' }), params({ id: 'T1' }));
    expect(res.status).toBe(400);
    expect(editTask).not.toHaveBeenCalled();
  });

  it('recorrência inválida devolve 400 sem chamar editTask', async () => {
    const res = await patchRoute(req({ recur: 'a cada hora' }), params({ id: 'T1' }));
    expect(res.status).toBe(400);
    expect(editTask).not.toHaveBeenCalled();
  });

  it('título iniciado com "-" devolve 400 sem chamar editTask', async () => {
    const res = await patchRoute(req({ title: '-rf tudo' }), params({ id: 'T1' }));
    expect(res.status).toBe(400);
    expect(editTask).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('chama deleteTask', async () => {
    await deleteRoute(req({}), params({ id: 'T1' }));
    expect(deleteTask).toHaveBeenCalledWith('u-1', 'T1');
  });

  it('id iniciado com "-" devolve 400 sem chamar deleteTask', async () => {
    const res = await deleteRoute(req({}), params({ id: '-rf' }));
    expect(res.status).toBe(400);
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('falha do CLI devolve 502 com mensagem estruturada, em vez de propagar um erro genérico', async () => {
    vi.mocked(deleteTask).mockRejectedValueOnce(new Error('mstodo falhou: sem credenciais'));
    const res = await deleteRoute(req({}), params({ id: 'T1' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('mstodo falhou: sem credenciais');
  });
});

describe('POST /api/tasks/[id]/subtasks', () => {
  it('id iniciado com "-" devolve 400 sem chamar addSubtask', async () => {
    const res = await createSubtaskRoute(req({ title: 'Sub' }), params({ id: '-rf' }));
    expect(res.status).toBe(400);
    expect(addSubtask).not.toHaveBeenCalled();
  });

  it('título iniciado com "-" devolve 400 sem chamar addSubtask', async () => {
    const res = await createSubtaskRoute(req({ title: '-rf tudo' }), params({ id: 'T1' }));
    expect(res.status).toBe(400);
    expect(addSubtask).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/tasks/[id]/subtasks/[itemId]', () => {
  it('completed marca a subtarefa', async () => {
    await patchSubtaskRoute(req({ completed: true }), params({ id: 'T1', itemId: 'S1' }));
    expect(checkSubtask).toHaveBeenCalledWith('u-1', 'T1', 'S1', true);
  });

  it('itemId iniciado com "-" devolve 400 sem chamar checkSubtask', async () => {
    const res = await patchSubtaskRoute(req({ completed: true }), params({ id: 'T1', itemId: '-rf' }));
    expect(res.status).toBe(400);
    expect(checkSubtask).not.toHaveBeenCalled();
  });

  it('título iniciado com "-" devolve 400 sem chamar editSubtask', async () => {
    const res = await patchSubtaskRoute(req({ title: '-rf tudo' }), params({ id: 'T1', itemId: 'S1' }));
    expect(res.status).toBe(400);
    expect(editSubtask).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/[id]/subtasks/[itemId]', () => {
  it('itemId iniciado com "-" devolve 400', async () => {
    const res = await deleteSubtaskRoute(req({}), params({ id: 'T1', itemId: '-rf' }));
    expect(res.status).toBe(400);
  });
});
