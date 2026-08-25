import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { addTask, editTask, completeTask, reopenTask, deleteTask, checkSubtask } from '@/lib/cli/mstodo';
import { POST as createRoute } from '@/app/api/tasks/route';
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/tasks/[id]/route';
import { PATCH as patchSubtaskRoute } from '@/app/api/tasks/[id]/subtasks/[itemId]/route';

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
    expect(addTask).toHaveBeenCalledWith('Nova tarefa');
    expect(editTask).toHaveBeenCalledWith('NEW-ID', expect.objectContaining({ priority: 'high' }));
  });

  it('data inválida devolve 400', async () => {
    const res = await createRoute(req({ title: 'Nova tarefa', due: 'não é uma data' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/[id]', () => {
  it('completed=true chama completeTask', async () => {
    await patchRoute(req({ completed: true }), params({ id: 'T1' }));
    expect(completeTask).toHaveBeenCalledWith('T1');
  });

  it('completed=false chama reopenTask', async () => {
    await patchRoute(req({ completed: false }), params({ id: 'T1' }));
    expect(reopenTask).toHaveBeenCalledWith('T1');
  });

  it('edição de campos chama editTask com a data já parseada', async () => {
    await patchRoute(req({ due: 'amanhã' }), params({ id: 'T1' }));
    expect(editTask).toHaveBeenCalledWith('T1', expect.objectContaining({ due: expect.any(String) }));
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('chama deleteTask', async () => {
    await deleteRoute(req({}), params({ id: 'T1' }));
    expect(deleteTask).toHaveBeenCalledWith('T1');
  });
});

describe('PATCH /api/tasks/[id]/subtasks/[itemId]', () => {
  it('completed marca a subtarefa', async () => {
    await patchSubtaskRoute(req({ completed: true }), params({ id: 'T1', itemId: 'S1' }));
    expect(checkSubtask).toHaveBeenCalledWith('T1', 'S1', true);
  });
});
