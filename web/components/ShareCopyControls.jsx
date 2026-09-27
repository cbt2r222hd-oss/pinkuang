'use client';

import { RefreshCw } from 'lucide-react';
import styles from './ShareCopyControls.module.css';

export default function ShareCopyControls({ locale = 'zh', channel, onChannelChange, onNextMotto }) {
  const english = locale === 'en';
  return <div className={styles.controls}>
    <div className={styles.channels} role="group" aria-label={english ? 'Preview share text' : '预览分享文案'}>
      <button type="button" aria-pressed={channel === 'telegram'} onClick={() => onChannelChange('telegram')}>Telegram</button>
      <button type="button" aria-pressed={channel === 'x'} onClick={() => onChannelChange('x')}>X</button>
    </div>
    <button type="button" className={styles.rotate} onClick={onNextMotto}><RefreshCw size={15} aria-hidden="true" />{english ? 'Try another line' : '换一句'}</button>
  </div>;
}
