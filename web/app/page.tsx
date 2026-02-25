'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const Showcase = dynamic(() => import('../components/Showcase'), { ssr: false });

export default function Home() {
  return <Showcase />;
}
