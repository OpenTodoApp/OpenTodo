package app.opentodo

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sin

/** A short sonification track owned by the foreground activity. */
internal class CompletionSound {
    private var track: AudioTrack? = null

    fun play(context: Context) {
        val audio = context.getSystemService(AudioManager::class.java) ?: return
        if (!allowsSound(audio.ringerMode)) return
        try {
            val player = track ?: createTrack()?.also { track = it } ?: return
            if (player.playState != AudioTrack.PLAYSTATE_STOPPED) player.stop()
            if (player.reloadStaticData() == AudioTrack.SUCCESS) player.play() else release()
        } catch (_: RuntimeException) {
            release()
        }
    }

    fun release() {
        track?.release()
        track = null
    }

    private fun createTrack(): AudioTrack? {
        val clip = samples()
        val player = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
            .setAudioFormat(AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(clip.size * Short.SIZE_BYTES)
            .build()
        val written = try { player.write(clip, 0, clip.size) } catch (_: RuntimeException) { AudioTrack.ERROR }
        if (written == clip.size) return player
        player.release()
        return null
    }

    companion object {
        const val SAMPLE_RATE = 48_000
        private const val LENGTH = 0.239
        fun allowsSound(ringerMode: Int): Boolean = ringerMode == AudioManager.RINGER_MODE_NORMAL

        private data class Partial(
            val start: Double, val length: Double, val hz: Double, val attack: Double,
            val release: Double, val decay: Double, val level: Double,
        )

        // The same two notes and short overtones as the web cue, pinned by the shared sample fixture.
        private val notes = listOf(
            Partial(start = 0.0, length = 0.139, hz = 523.25, attack = 0.008, release = 0.036, decay = 17.0, level = 0.62),
            Partial(start = 0.072, length = LENGTH - 0.072, hz = 830.608471346744, attack = 0.004, release = 0.038, decay = 15.8, level = 0.95),
            Partial(start = 0.072, length = 0.073, hz = 2085.0233696990936, attack = 0.002, release = 0.026, decay = 58.0, level = 0.29),
            Partial(start = 0.072, length = 0.042, hz = 2725.998541786467, attack = 0.0015, release = 0.026, decay = 115.0, level = 0.29 * 0.43),
        )

        fun samples(): ShortArray {
            val frames = (SAMPLE_RATE * LENGTH).roundToInt()
            var peak = 0.0
            val clip = FloatArray(frames) { frame ->
                var sample = 0.0
                for (note in notes) {
                    val time = frame.toDouble() / SAMPLE_RATE - note.start
                    if (time < 0 || time >= note.length) continue
                    val envelope = minOf(1.0, time / note.attack, (note.length - time) / note.release)
                    sample += sin(2 * Math.PI * (note.hz * time)) * envelope * note.level * exp(-note.decay * time)
                }
                peak = maxOf(peak, abs(sample))
                sample.toFloat()
            }
            return ShortArray(frames) { frame ->
                val amplitude = (clip[frame] * 0.12 / peak).toFloat()
                (amplitude.toDouble() * Short.MAX_VALUE).roundToInt().toShort()
            }
        }
    }
}
