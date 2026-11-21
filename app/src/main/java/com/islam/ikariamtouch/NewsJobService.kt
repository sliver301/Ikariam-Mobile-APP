package com.islam.ikariamtouch

import android.app.job.JobParameters
import android.app.job.JobService

/** Runs one background news check (see [NewsChecker]) and schedules the next one. */
class NewsJobService : JobService() {

    private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        worker = Thread {
            try {
                NewsChecker(applicationContext).check()
            } catch (e: Exception) {
                // network trouble etc.: just try again next time
            }
            NewsChecker.scheduleNext(applicationContext)
            jobFinished(params, false)
        }.apply { start() }
        return true   // work continues on the thread
    }

    override fun onStopJob(params: JobParameters): Boolean {
        worker?.interrupt()
        NewsChecker.scheduleNext(applicationContext)
        return false
    }
}
