import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileModuleNav } from '@/components/MobileModuleNav';

afterEach(cleanup);

describe('MobileModuleNav', () => {
  it('mostra um botão com o nome em português para cada módulo', () => {
    render(
      <MobileModuleNav
        modules={['email', 'tasks', 'jira']}
        active="email"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'E-mail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tarefas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jira' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marca o módulo ativo como a página atual', () => {
    render(
      <MobileModuleNav modules={['email', 'jira']} active="jira" onChange={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Jira' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'E-mail' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('avisa qual módulo foi escolhido', () => {
    const onChange = vi.fn();
    render(<MobileModuleNav modules={['email', 'jira']} active="email" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Jira' }));

    expect(onChange).toHaveBeenCalledWith('jira');
  });
});
