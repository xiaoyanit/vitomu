import { Injectable } from '@angular/core';
import * as ffmpeg from 'fluent-ffmpeg-corrected';
import * as path from 'path';
import * as progressStream from 'progress-stream';
import { Observable, Subject } from 'rxjs';
import * as sanitize from 'sanitize-filename';
import { Readable } from 'stream';
import * as ytdl from 'ytdl-core';
import { AudioFormat } from '../../core/audio-format';
import { Constants } from '../../core/constants';
import { FileSystem } from '../../core/file-system';
import { Logger } from '../../core/logger';
import { Settings } from '../../core/settings';
import { ConvertState } from './convert-state';
import { FFmpegChecker } from './ffmpeg-checker';
import { VideoDetails } from './video-details';

@Injectable({
    providedIn: 'root',
})
export class ConvertService {
    private youtubeVideoQuality: string = 'highest';
    private requestOptions: any = { maxRedirects: 5 };
    private progressTimeoutMilliseconds: number = 100;
    private outputPath: string = path.join(this.fileSystem.musicDirectory(), 'Vitomu');
    private _lastConvertedFilePath: string = '';
    private _lastConvertedFileName: string = '';

    private convertStateChanged: Subject<ConvertState> = new Subject<ConvertState>();
    public convertStateChanged$: Observable<ConvertState> = this.convertStateChanged.asObservable();

    private convertProgressChanged: Subject<number> = new Subject<number>();
    public convertProgressChanged$: Observable<number> = this.convertProgressChanged.asObservable();

    private _selectedAudioFormat: AudioFormat;
    private _selectedAudioBitrate: number;

    constructor(private logger: Logger, private ffmpegChecker: FFmpegChecker, private fileSystem: FileSystem, private settings: Settings) {
        this._selectedAudioFormat = this.audioFormats.find(x => x.id === this.settings.audioFormat);
        this._selectedAudioBitrate = this.audioBitrates.find(x => x === this.settings.audioBitrate);
    }

    public audioFormats: AudioFormat[] = Constants.audioFormats;
    public audioBitrates: number[] = Constants.audioBitrates;

    public get lastConvertedFilePath(): string {
        return this._lastConvertedFilePath;
    }

    public set lastConvertedFilePath(v: string) {
        this._lastConvertedFilePath = v;
    }

    public get lastConvertedFileName(): string {
        return this._lastConvertedFileName;
    }

    public set lastConvertedFileName(v: string) {
        this._lastConvertedFileName = v;
    }

    public get selectedAudioFormat(): AudioFormat {
        return this._selectedAudioFormat;
    }

    public set selectedAudioFormat(v: AudioFormat) {
        this._selectedAudioFormat = v;
        this.settings.audioFormat = v.id;
    }

    public get selectedAudioBitrate(): number {
        return this._selectedAudioBitrate;
    }

    public set selectedAudioBitrate(v: number) {
        this._selectedAudioBitrate = v;
        this.settings.audioBitrate = v;
    }

    public onConvertStateChanged(convertState: ConvertState): void {
        this.convertStateChanged.next(convertState);
    }

    public onConvertProgressChanged(progressPercent: number): void {
        this.convertProgressChanged.next(progressPercent);
    }

    public isVideoUrlConvertible(videoUrl: string): boolean {
        if (videoUrl && videoUrl.includes('www.youtube.com/watch?v=')) {
            return true;
        }

        return false;
    }

    public async convertAsync(videoUrl: string): Promise<void> {
        try {
            await this.ffmpegChecker.ensureFFmpegIsAvailableAsync();
        } catch (error) {
            this.logger.error(`Could not ensure that FFmpeg is available. Error: ${error}`, 'ConvertService', 'convertAsync');
            this.onConvertStateChanged(ConvertState.FFmpegNotFound);

            return;
        }

        if (!await this.ffmpegChecker.isFFmpegInSystemPathAsync() && !this.ffmpegChecker.getPathOfDownloadedFFmpeg()) {
            this.logger.error('FFmpeg is not available.', 'ConvertService', 'convertAsync');
            this.onConvertStateChanged(ConvertState.FFmpegNotFound);

            return;
        }

        this.onConvertProgressChanged(0);
        this.onConvertStateChanged(ConvertState.Converting);

        try {
            // Get info
            const videoInfo: ytdl.videoInfo = await ytdl.getInfo(videoUrl);
            const videoDetails: VideoDetails = new VideoDetails(videoInfo);
            const filePath: string = path.join(this.outputPath, sanitize(videoDetails.videoTitle) + this.selectedAudioFormat.extension);

            this.logger.info(`File path: ${filePath}`, 'ConvertService', 'convertAsync');

            // Make sure outputPath exists
            await this.fileSystem.ensureDirectoryAsync(this.outputPath);

            // Download
            const videoStream: Readable = ytdl.downloadFromInfo(videoInfo, {
                quality: this.youtubeVideoQuality,
                requestOptions: this.requestOptions
            });

            videoStream.on('response', async (httpResponse) => {
                // Setup of progress module
                const str: any = progressStream({
                    length: parseInt(httpResponse.headers['content-length'], 10),
                    time: this.progressTimeoutMilliseconds
                });

                // Add progress event listener
                str.on('progress', (progress) => {
                    this.onConvertProgressChanged(parseInt(progress.percentage, 10));
                });

                if (!await this.ffmpegChecker.isFFmpegInSystemPathAsync()) {
                    ffmpeg.setFfmpegPath(this.ffmpegChecker.getPathOfDownloadedFFmpeg());
                }

                // Start encoding
                // .audioBitrate(videoInfo.formats[0].audioBitrate)
                const proc: any = new ffmpeg({
                    source: videoStream.pipe(str)
                })
                    .audioBitrate(this.selectedAudioBitrate)
                    .toFormat(this.selectedAudioFormat.ffmpegFormat)
                    .on('error', (error) => {
                        this.onConvertStateChanged(ConvertState.Failed);
                        this.logger.error(`An error occurred while encoding. Error: ${error}`, 'ConvertService', 'convertAsync');
                    })
                    .on('end', () => {
                        this.onConvertStateChanged(ConvertState.Successful);
                        this.lastConvertedFilePath = filePath;
                        this.lastConvertedFileName = this.fileSystem.getFileName(filePath);
                        this.logger.info(`Convertion of video '${videoUrl}' to file '${filePath}' was succesful`, 'ConvertService', 'convertAsync');

                    })
                    .saveToFile(filePath);
            });
        } catch (error) {
            this.onConvertStateChanged(ConvertState.Failed);
            this.logger.error(`Could not download video. Error: ${error}`, 'ConvertService', 'convertAsync');
        }
    }
}
