// Copyright © 2022 Ory Corp
// SPDX-License-Identifier: Apache-2.0
import { Session } from "@ory/client"
import { AxiosError } from "axios"
import { NextFunction, Request, Response } from "express"
import { getUrlForFlow, isUUID } from "./index"
import { RouteOptionsCreator } from "./route"

/**
 * Checks the error returned by toSession() and initiates a 2FA flow if necessary
 * or returns false.
 *
 * @internal
 * @param res
 * @param apiBaseUrl
 */
const maybeInitiate2FA =
  (req: Request, res: Response, apiBaseUrl: string) => (err: AxiosError) => {
    // 403 on toSession means that we need to request 2FA
    if (err.response && err.response.status === 403) {
      res.redirect(
        getUrlForFlow(
          apiBaseUrl,
          "login",
          new URLSearchParams({ aal: "aal2", return_to: req.url.toString() }),
        ),
      )
      return true
    }
    return false
  }

/**
 * Adds the session to the request object.
 *
 * @param req
 */
const addSessionToRequest =
  (req: Request) =>
  ({ data: session }: { data: Session }) => {
    // `whoami` returns the session or an error. We're changing the type here
    // because express-session is not detected by TypeScript automatically.
    req.session = session
  }

/**
 * This middleware requires that the HTTP request has a session.
 * If the session is not present, it will redirect to the login flow.
 *
 * If a session is set but 403 is returned, a 2FA flow will be initiated.
 *
 * @param createHelpers
 */
export const requireAuth =
  (createHelpers: RouteOptionsCreator) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { frontend, apiBaseUrl } = createHelpers(req, res)

    // when accessing settings with a valid flow id
    // we allow the settings page to trigger the
    // login flow on session_aal2_required
    if (req.url.includes("/settings") && req.query.flow) {
      if (isUUID.test(req.query.flow.toString())) {
        next()
        return
      }
    }
    frontend
      .toSession({ cookie: req.header("cookie") })
      .then(addSessionToRequest(req))
      .then(() => next())
      .catch((err: AxiosError) => {
        if (!maybeInitiate2FA(req, res, apiBaseUrl)(err)) {
          res.redirect(getUrlForFlow(apiBaseUrl, "login"))
          return
        }
      })
  }

/**
 * Sets the session in the request. If no session is found,
 * the request still succeeds.
 *
 * If a session is set but 403 is returned, a 2FA flow will be initiated.
 *
 * @param createHelpers
 */
export const setSession =
  (createHelpers: RouteOptionsCreator) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { frontend, apiBaseUrl } = createHelpers(req, res)
    frontend
      .toSession({ cookie: req.header("cookie") })
      .then(addSessionToRequest(req))
      .catch(maybeInitiate2FA(req, res, apiBaseUrl))
      .then(() => next())
  }

/**
 * This middleware requires that the HTTP request has no session.
 * If the session is present, it will redirect to the home page.
 *
 * @param createHelpers
 */
export const requireNoAuth =
  (createHelpers: RouteOptionsCreator) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { frontend } = createHelpers(req, res)
    frontend
      .toSession({ cookie: req.header("cookie") })
      .then(() => {
        res.redirect("welcome")
      })
      .catch(() => {
        next()
      })
  }
