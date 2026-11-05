import { useEffect, useState } from 'react';
import { useApp } from '../app-context.ts';
import { checkPin, MAX_TRIES, WAIT_MS } from '../domain/pin.ts';
import { Modal } from './common.tsx';

// The admin PIN pad: big keys, the digits shown as dots, a wait after too many wrong tries.

let tries = 0;
let waitUntil = 0;

export function PinPad({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  const { t, settings } = useApp();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const waiting = waitUntil > now;
  const press = async (k: string) => {
    if (waiting) return;
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    const length = settings.pinLength ?? 4;
    const next = (pin + k).slice(0, length);
    setPin(next);
    setWrong(false);
    if (next.length < length) return;
    if (await checkPin(next, settings.pinHash)) {
      tries = 0;
      onOk();
      return;
    }
    tries++;
    setWrong(true);
    setPin('');
    if (tries >= MAX_TRIES) {
      waitUntil = Date.now() + WAIT_MS;
      tries = 0;
    }
  };
  return (
    <Modal title={t('admin.pinTitle')} onClose={onClose}>
      <p className="pin-dots" aria-label={t('admin.pinTitle')}>
        {pin.length ? '●'.repeat(pin.length) : ' '}
      </p>
      {wrong && <p className="pin-wrong">{t('admin.pinWrong')}</p>}
      {waiting && <p className="pin-wrong">{t('admin.pinWait', { s: Math.ceil((waitUntil - now) / 1000) })}</p>}
      <div className="pack-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k ? (
            <button key={i} type="button" className="button" disabled={waiting} onClick={() => void press(k)}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </Modal>
  );
}
