import { redirect } from 'next/navigation';

// The workspace moved into the home page, chosen there; this keeps old links working.
export default function TesteHomeRedirect(): never {
  redirect('/');
}
