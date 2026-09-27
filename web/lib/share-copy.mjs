// A user's selection stays stable until they explicitly choose another line.
const INVITATIONS = {
  zh: ['一份也是矿友，一起才有意思。', '把朋友叫上，把矿机拼上。', '一起拼矿，一起发光。'],
  en: ['One share makes you part of the crew.', 'Bring a friend. Build your mining crew.', 'Mine together. Shine together.'],
};
const UPDATES = {
  zh: ['这一份参与，值得分享。', '和矿友一起，见证每一步。', '每一份参与，都有自己的故事。'],
  en: ['A shared journey. A story worth sharing.', 'Follow every step with the mining crew.', 'Every share has a story.'],
};

export const SHARE_MOTTO_COUNT = 3;

export function shareMotto(locale = 'zh', index = 0, canSubscribe = false) {
  const choices = (canSubscribe ? INVITATIONS : UPDATES)[locale === 'en' ? 'en' : 'zh'];
  const safeIndex = Number.isSafeInteger(index) && index >= 0 ? index % choices.length : 0;
  return choices[safeIndex];
}
