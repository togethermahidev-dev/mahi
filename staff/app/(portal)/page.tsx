import { redirect } from 'next/navigation';
import { HOME } from '@/lib/guard';

export default function Home() {
  redirect(HOME);
}
