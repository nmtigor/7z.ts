/** 80**************************************************************************
 * This module is loaded with top priority!
 *
 * @module preNs
 * @license MIT
 ******************************************************************************/

export {};
/*80--------------------------------------------------------------------------*/

// deno-fmt-ignore
/* preprocessor names */
export const 
  /** Release Candidate */RC = true // rc.premsys.org

, LOCAL = false
  , STAGE = false
, CF = false // cloudflare

, DENO = true
, MOZCENTRAL = false

, INOUT = true // contracts
, DEBUG = true // debug build
  , COLR = true
  , INFO = true
  , STEP = true
  , TRACE = true
  
  , RESIZ = true // "resize", `ResizeObserver`
  , INTRS = true // `IntersectionObserver`

  , THEMESETTING = false
  , EDITOR = true
    , /** @deprecated */EDITOR_v = true // verbose
  , PDFTS = true
    , PDFTS_v = true // verbose
      , PDFTS_vv = false // very verbose
, /** @deprecated */APP = false // release build 
, /** PeRFormance */PRF = true

, AUTOTEST = true
, CYPRESS = false 
, WDIO = false 

, _COLR = DEBUG && COLR
, _INFO = DEBUG && INFO
, _STEP = DEBUG && STEP && !AUTOTEST
, _TRACE = DEBUG && TRACE && !AUTOTEST

/* Only in ./pdf/ */
, PDFJSDev = true
, GENERIC = true
, CHROME = false
, GECKOVIEW = false
, LIB = false
, SKIP_BABEL = true
, IMAGE_DECODERS = false
, COMPONENTS = false
;
/*80--------------------------------------------------------------------------*/
