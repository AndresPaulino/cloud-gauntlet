// The story that runs through the Gauntlet: you are the founding architect of a ticketing startup.
// One chapter per module. Pure data (type-only imports) so scripts can load it with plain Node.
import type { ModuleId } from './types';

export interface Chapter {
  module: ModuleId;
  title: string;
  /** Shown before the module's first lesson and on the company page. */
  intro: string;
  /** What you're about to fix, in one line. */
  mission: string;
  /** The press headline when every lesson in the module is done. */
  headline: string;
  /** Where the company works once this chapter is done. */
  hq: string;
}

export const DEFAULT_COMPANY = 'Stagepass';

export const chapters: Chapter[] = [
  {
    module: 'm1', title: 'Chapter 1 · Day one',
    intro: 'You have just joined {co} as founding architect. Two founders, one laptop, and a brand-new AWS account whose root password is on a sticky note. {co} will sell tickets for live events, which means card payments, which means attackers. Nothing goes live until the account is locked down.',
    mission: 'Lock the account, set up IAM properly, and build a VPC where the payments database is unreachable from the internet.',
    headline: '{co} passes its first payment-security audit',
    hq: 'Co-working desk',
  },
  {
    module: 'm2', title: 'Chapter 2 · The first ticket drop',
    intro: 'A band everyone has heard of announces its tour on {co}. Tickets go on sale Friday at 10:00 sharp and 40,000 fans will hit the site in the same minute. Right now it runs on a single EC2 instance. If that box dies, so does the company.',
    mission: 'Survive the spike: load balancers, Auto Scaling, a queue to absorb orders, DNS failover and a disaster-recovery plan.',
    headline: '{co} sells out a stadium tour in 4 minutes with zero downtime',
    hq: 'Loft office',
  },
  {
    module: 'm3a', title: 'Chapter 3 · Drowning in data',
    intro: 'Success has a side effect: data. Ticket PDFs, venue seat maps, millions of photos fans upload after each show, and ten years of box-office records sitting on an old office NAS that a new client wants migrated by next month.',
    mission: 'Put every byte in the right storage class, automate its lifecycle, and move the legacy data in without breaking anything.',
    headline: '{co} cuts its storage bill by 60% and finishes the migration early',
    hq: 'Office floor',
  },
  {
    module: 'm3b', title: 'Chapter 4 · Going global',
    intro: 'Festivals in Europe and Asia sign up. Fans in Tokyo wait four seconds for a seat map, and at peak the database CPU sits at 100%. The board wants {co} fast everywhere before the summer festival season.',
    mission: 'Pick the right compute, databases and caches, and push content to the edge.',
    headline: '{co} now serves 12 countries in under 100 ms',
    hq: 'Two floors downtown',
  },
  {
    module: 'm4', title: 'Chapter 5 · The bill arrives',
    intro: 'Board meeting. The first slide is the AWS bill: $180,000 last month, up 40%. The lead investor asks one question: "Why?" You have one quarter to make {co} profitable without slowing it down.',
    mission: 'Right-size, buy capacity the smart way, and stop paying for data transfer you don\'t need.',
    headline: '{co} turns profitable after halving its cloud bill',
    hq: 'Tower HQ',
  },
  {
    module: 'm5', title: 'Chapter 6 · IPO due diligence',
    intro: 'The bankers are in. Before {co} can go public, auditors will look at everything: governance, compliance, and every service someone switched on and never documented. No gaps allowed.',
    mission: 'Close every remaining gap so nothing surprises the auditors. Then beat the final boss to ring the opening bell.',
    headline: '{co} clears due diligence. The IPO is on.',
    hq: 'Campus',
  },
];

export const fill = (text: string, company: string) => text.replaceAll('{co}', company);
