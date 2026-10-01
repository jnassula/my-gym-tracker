/** This build's version: worked out by CI from the git history (deploy/version.sh) and baked in
 * when the production image is built. "dev" anywhere else. */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || 'dev'
