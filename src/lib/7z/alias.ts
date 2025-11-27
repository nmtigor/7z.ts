/** 80**************************************************************************
 * @module lib/7z/alias
 * @license LGPL-2.1
 ******************************************************************************/

export {};
/*80--------------------------------------------------------------------------*/

export enum NID {
  kEnd,

  kHeader,

  kArchiveProperties,

  kAdditionalStreamsInfo,
  kMainStreamsInfo,
  kFilesInfo,

  kPackInfo,
  kUnpackInfo,
  kSubStreamsInfo,

  kSize,
  kCRC,

  kFolder,

  kCodersUnpackSize,
  kNumUnpackStream,

  kEmptyStream,
  kEmptyFile,
  kAnti,

  kName,
  kCTime,
  kATime,
  kMTime,
  kWinAttrib,
  kComment,

  kEncodedHeader,

  kStartPos,
  kDummy,
}
/*64----------------------------------------------------------*/

/** SignatureHeader size */
export const kHeaderSize = 32;
export const kMajorVersion = 0;

export const k_Scan_NumCoders_MAX = 64;
// export const k_Scan_NumCodersStreams_in_Folder_MAX = 64;

// export const k_LZMA2 = 0x21;
/** 0x30101 */
export const k_LZMA = 0x30101;
/*80--------------------------------------------------------------------------*/

export type FetchP = RequestInfo | URL;
/*80--------------------------------------------------------------------------*/

/** `>= kHeaderSize` */
export const RsU8aSize = 1024;
/*80--------------------------------------------------------------------------*/
