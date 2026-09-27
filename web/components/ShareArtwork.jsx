'use client';

import { Download } from 'lucide-react';
import styles from './ShareArtwork.module.css';

export default function ShareArtwork({ locale = 'zh' }) {
  const english = locale === 'en';
  const base = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/images/bemine-share-v10`;
  return <figure className={styles.artwork}>
    <img src={`${base}.webp`} width="1200" height="630" decoding="async"
      alt={english ? 'BEMine: friends gathered around a mining chip and BEM coins. Mine together, shine together.' : '拼矿 BEMine：矿友围坐在墨绿芯片与香槟金 BEM 币旁，一起拼矿，一起发光。'} />
    <figcaption>
      <span>{english ? 'Your mining crew starts here.' : '矿友，从这一份开始。'}</span>
      <a href={`${base}.jpg`} download="BEMine-share.jpg"><Download size={16} aria-hidden="true" />{english ? 'Save image' : '保存分享图片'}</a>
      <p>{english ? 'Want to post with an image? Save the poster, then add it in Telegram or X.' : '想配图发布？保存海报后，在 Telegram 或 X 中添加图片。'}</p>
    </figcaption>
  </figure>;
}
