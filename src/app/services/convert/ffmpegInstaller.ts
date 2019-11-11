import { Logger } from '../../core/logger';
import * as path from 'path';
import { Paths } from '../../core/paths';
import * as fs from 'fs-extra';
import * as ffbinaries from 'ffbinaries';

export class FFmpegInstaller {
    private ffmpegFolder: string = path.join(Paths.applicatioData(), "FFmpeg");
    private _ffmpegPath : string;

    constructor(private logger: Logger) {
        // Make sure _ffmpegPath is set
        this.isFFmpegInstalled();
    }

    public get ffmpegPath() : string {
        return this._ffmpegPath;
    }

    public async downloadFFmpegIfneeded(): Promise<void> {
        if (this.isFFmpegInstalled()) {
            this.logger.info("FFmpeg is already installed. No need to download.", "FFmpegInstaller", "downloadFFmpegIfneeded");

            return;
        }

        this.logger.info("Start downloading FFmpeg.", "FFmpegInstaller", "downloadFFmpegIfneeded");
        await ffbinaries.downloadBinaries(['ffmpeg'], { destination: this.ffmpegFolder });
        //await ffbinaries.downloadBinaries(['ffmpeg', 'ffprobe'], { destination: this.ffmpegPath });
        this.logger.info("Finished downloading FFmpeg.", "FFmpegInstaller", "downloadFFmpegIfneeded");
    }

    public isFFmpegInstalled(): boolean {
        try {
            if (fs.existsSync(this.ffmpegFolder)) {
                this._ffmpegPath = fs.readdirSync(this.ffmpegFolder).find(file => file.includes('ffmpeg'));
                //let ffprobeFile: any = fs.readdirSync(this.ffmpegPath).find(file => file.includes('ffprobe'));

                if (this._ffmpegPath) {
                //if (ffmpegFile && ffprobeFile) {
                    this.logger.info(`FFmpeg was found in at ${this._ffmpegPath}`, "FFmpegInstaller", "isFFmpegInstalled");

                    return true;
                }
            }
        } catch (error) {
            this.logger.error(`Could not check if FFmpeg is installed. Error: ${error}`, "FFmpegInstaller", "isFFmpegInstalled");
        }

        this.logger.info(`FFmpeg was not found in folder ${this.ffmpegFolder}`, "FFmpegInstaller", "isFFmpegInstalled");

        return false;
    }
}