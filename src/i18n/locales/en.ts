/**
 * English is the source language: this file is the canonical copy, and every
 * other locale is a translation of it. No user-facing string belongs anywhere
 * else — if you are about to type text into a component, add a key here.
 */
export const en = {
  common: {
    appName: "{{productName}}",
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    create: "Create",
    signIn: "Sign in",
    signOut: "Sign out",
    retry: "Try again",
  },
  landing: {
    title: "{{productName}}",
    subtitle: "Run your leagues, competitions and teams in one place.",
    adminCta: "Go to the dashboard",
  },
  auth: {
    signInTitle: "Sign in to {{productName}}",
    signInSubtitle: "We'll email you a link. No password to remember.",
    emailLabel: "Email address",
    emailPlaceholder: "you@league.com",
    sendLink: "Email me a link",
    sending: "Sending…",
    linkSent: "Check your inbox — the sign-in link is on its way to {{email}}.",
    linkError: "We couldn't send that link. Check the address and try again.",
    callbackWorking: "Signing you in…",
    callbackError: "That sign-in link didn't work. It may have expired.",
    backToSignIn: "Back to sign in",
  },
  org: {
    switcherLabel: "Organization",
    noneTitle: "No organization yet",
    noneBody: "Create one to start setting up seasons, teams and competitions.",
    createTitle: "Create an organization",
    nameLabel: "Organization name",
    namePlaceholder: "Perth Amateur Football League",
    slugLabel: "URL",
    slugHelp: "This is the public address of your competitions.",
    timezoneLabel: "Time zone",
    timezoneHelp: "Kick-off times are shown to everyone in this zone.",
    createError: "We couldn't create that organization.",
    slugTaken: "That URL is already taken. Try another one.",
    dashboardTitle: "Dashboard",
    dashboardEmpty: "Nothing here yet. Seasons, teams and competitions come next.",
    roleOwner: "Owner",
    roleAdmin: "Admin",
    roleStaff: "Staff",
    roleTeamAdmin: "Team admin",
    roleViewer: "Viewer",
  },
  errors: {
    notFoundTitle: "Page not found",
    notFoundBody: "The page you asked for doesn't exist.",
    genericTitle: "Something went wrong",
    genericBody: "Something on this page failed to load. Try again in a moment.",
    forbiddenTitle: "No access",
    forbiddenBody: "Your account isn't a member of this organization.",
  },
} as const;

export type Translations = typeof en;
