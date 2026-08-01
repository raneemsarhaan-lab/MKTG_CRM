/**
 * Celebration reactions — transcribed from CRM_Labels_Reference.xlsx,
 * sheet "Celebration Messages".
 *
 * The sheet's own heading is "Random on Task Completion": a reaction and one
 * of its three message pairs are chosen at random when a task advances. The
 * user does not pick one.
 *
 * Copy is Egyptian Arabic and is reproduced verbatim from the sheet — do not
 * "correct" the spelling or punctuation, it is written the way the team
 * speaks. Colours match REACTION_COLORS in tokens.ts.
 */

export type ReactionKey = 'zaghrota' | 'tasqeef' | 'mabhour' | 'tabla'

export type ConfettiShape = 'streamer' | 'circle' | 'star' | 'drop'

export interface ReactionMessage {
  /** Headline, e.g. "زغرووووطة عليكيييي!" */
  message: string
  /** Second line, e.g. "وحياة اللي بتحبيه انت شاطر" */
  subline: string
}

export interface Reaction {
  key:      ReactionKey
  labelAr:  string
  emoji:    string
  color:    string
  /** Ordered candidate sources — the first the browser can play wins. */
  sources:  string[]
  shape:    ConfettiShape
  messages: ReactionMessage[]
}

export const REACTIONS: Reaction[] = [
  {
    key:     'zaghrota',
    labelAr: 'زغروطة',
    emoji:   '🎉',
    color:   '#D4537E',
    sources: ['/sounds/zaghrota.mp3'],
    shape:   'streamer',
    messages: [
      { message: 'زغرووووطة عليكيييي!',              subline: 'وحياة اللي بتحبيه انت شاطر' },
      { message: 'الزغروطة دي من القلب!',            subline: 'ربنا يكرمك ويكرم اللي بعدها' },
      { message: 'يلعن ابو التاسك، خلصت بالزغروطة!', subline: 'ايوه كده، كمّل على الآخر' },
    ],
  },
  {
    key:     'tasqeef',
    labelAr: 'تسقيف',
    emoji:   '👏',
    color:   '#378ADD',
    sources: ['/sounds/tasqeef.mp3'],
    shape:   'circle',
    messages: [
      { message: 'تسقيف حار عليك!',          subline: 'شغل كده كل يوم ومنرهق' },
      { message: 'ايدينا وجعت من التصفيق!',  subline: 'انت نجم الشغل النهارده' },
      { message: 'يستاهل تصفيق على المسرح!', subline: 'الفريق بيصفق معاك' },
    ],
  },
  {
    key:     'mabhour',
    labelAr: 'انا مبهور بيا',
    emoji:   '⭐',
    color:   '#EF9F27',
    // The sheet names a .mov. It ships as one, but QuickTime is unreliable
    // outside Safari, so the MP4 of the same asset is offered first.
    sources: ['/sounds/mabhour.mp4', '/sounds/mabhour.mov'],
    shape:   'star',
    messages: [
      { message: 'انا مبهور بيا!!',              subline: 'والله انت مش طبيعي' },
      { message: 'يا نجم يا واد يا نجم!',        subline: 'ربنا يزيدك من فضله' },
      { message: 'ايه اللي انت بتعمله ده يابني!', subline: 'الشغل ده بيتعمل ازاي يعني؟!' },
    ],
  },
  {
    key:     'tabla',
    labelAr: 'طبلة',
    emoji:   '🥁',
    color:   '#534AB7',
    sources: ['/sounds/tabla.mp3'],
    shape:   'drop',
    messages: [
      { message: 'طبلة عالتاسك ده!',    subline: 'احتفال مستحق يا باشا' },
      { message: 'دق الطبل واحتفل!',    subline: 'الإنجاز ده يستاهل أكتر' },
      { message: 'يستاهل طبلة وزمر!',   subline: 'اوعى تقف، في تاسكات تانية' },
    ],
  },
]

export const REACTION_BY_KEY: Record<ReactionKey, Reaction> =
  Object.fromEntries(REACTIONS.map(r => [r.key, r])) as Record<ReactionKey, Reaction>

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** A random reaction paired with one of its random message lines. */
export function randomCelebration(): { reaction: Reaction; line: ReactionMessage } {
  const reaction = pick(REACTIONS)
  return { reaction, line: pick(reaction.messages) }
}
