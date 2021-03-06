import createApp from '../createApp'
import ReamError from '../ReamError'
import { routerReady } from '../utils'

const isDev = process.env.NODE_ENV !== 'production'

// This exported function will be called by `bundleRenderer`.
// This is where we perform data-prefetching to determine the
// state of our application before actually rendering it.
// Since data fetching is async, this function is expected to
// return a Promise that resolves to the app instance.
export default async context => {
  const s = isDev && Date.now()

  const { req } = context
  const { app, router, store } = await createApp(req)

  router.push(req.url)

  await routerReady(router)

  const matchedComponents = router.getMatchedComponents()
  // No matched routes
  if (matchedComponents.length === 0) {
    throw new ReamError({
      code: 'ROUTE_COMPONENT_NOT_FOUND',
      message: `Cannot find corresponding route component for ${req.url}`
    })
  }

  // Call fetchData hooks on components matched by the route.
  // A preFetch hook dispatches a store action and returns a Promise,
  // which is resolved when the action is complete and store state has been
  // updated.
  await Promise.all(
    matchedComponents.map(
      ({ getInitialData }) =>
        getInitialData &&
        getInitialData({
          req,
          store,
          route: router.currentRoute
        })
    )
  )

  if (__DEV__) {
    console.log(`route component resolve in: ${Date.now() - s}ms`)
  }

  // After all preFetch hooks are resolved, our store is now
  // filled with the state needed to render the app.
  // Expose the state on the render context, and let the request handler
  // inline the state in the HTML response. This allows the client-side
  // store to pick-up the server-side state without having to duplicate
  // the initial data fetching on the client.
  if (store) {
    context.state = store.state
  }
  if (app.$meta) {
    context.meta = app.$meta()
  }

  return app
}
