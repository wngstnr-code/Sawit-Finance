'use client';

import { useEffect, useState } from 'react';
import { useClickRef } from '@make-software/csprclick-ui';

export function useAccount() {
  const clickRef = useClickRef();
  const [publicKey, setPublicKey] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!clickRef) return;
    setReady(true);

    const onIn = (evt: { account?: { public_key?: string } }) =>
      setPublicKey(evt.account?.public_key ?? undefined);
    const onOut = () => setPublicKey(undefined);

    clickRef.on('csprclick:signed_in', onIn);
    clickRef.on('csprclick:switched_account', onIn);
    clickRef.on('csprclick:signed_out', onOut);
    clickRef.on('csprclick:disconnected', onOut);

    clickRef
      .getActiveAccountAsync?.()
      .then((acc: { public_key?: string } | null) =>
        setPublicKey(acc?.public_key ?? undefined)
      )
      .catch(() => {});

    return () => {
      clickRef.off?.('csprclick:signed_in', onIn);
      clickRef.off?.('csprclick:switched_account', onIn);
      clickRef.off?.('csprclick:signed_out', onOut);
      clickRef.off?.('csprclick:disconnected', onOut);
    };
  }, [clickRef]);

  return {
    clickRef,
    publicKey,
    connected: Boolean(publicKey),
    ready,
    connect: () => clickRef?.signIn(),
    disconnect: () => clickRef?.signOut(),
  };
}
