/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as adminGate from "../adminGate.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as auth_firebase from "../auth/firebase.js";
import type * as auth_otpEmail from "../auth/otpEmail.js";
import type * as claims from "../claims.js";
import type * as community from "../community.js";
import type * as crons from "../crons.js";
import type * as dataRetention from "../dataRetention.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as errorReports from "../errorReports.js";
import type * as http from "../http.js";
import type * as offers from "../offers.js";
import type * as otpEmail from "../otpEmail.js";
import type * as phoneMigration from "../phoneMigration.js";
import type * as phoneVault from "../phoneVault.js";
import type * as profile from "../profile.js";
import type * as securityIncidents from "../securityIncidents.js";
import type * as securitySignal from "../securitySignal.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";
import type * as vendors from "../vendors.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  adminGate: typeof adminGate;
  analytics: typeof analytics;
  audit: typeof audit;
  auth: typeof auth;
  "auth/firebase": typeof auth_firebase;
  "auth/otpEmail": typeof auth_otpEmail;
  claims: typeof claims;
  community: typeof community;
  crons: typeof crons;
  dataRetention: typeof dataRetention;
  emailTemplates: typeof emailTemplates;
  errorReports: typeof errorReports;
  http: typeof http;
  offers: typeof offers;
  otpEmail: typeof otpEmail;
  phoneMigration: typeof phoneMigration;
  phoneVault: typeof phoneVault;
  profile: typeof profile;
  securityIncidents: typeof securityIncidents;
  securitySignal: typeof securitySignal;
  storage: typeof storage;
  users: typeof users;
  vendors: typeof vendors;
  whatsapp: typeof whatsapp;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
