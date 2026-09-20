import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function SOSDummyTab() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/sos');
  }, []);

  return null;
}
