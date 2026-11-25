package com.islam.ikariamtouch

import android.app.job.JobParameters
import android.app.job.JobService
import kotlin.concurrent.thread

/** The slow backup of the minute alarm (see [NewsChecker]): checks, and arms the alarm if it was lost. */
class NewsJobService : JobService() {

    override fun onStartJob(params: JobParameters): Boolean {
        NewsChecker.keepGoing(applicationContext)
        thread {
            try {
                NewsChecker(applicationContext).check()
            } catch (e: Exception) {
                // network trouble etc.: just try again next time
            }
            jobFinished(params, false)
        }
        return true   // work continues on the thread
    }

    override fun onStopJob(params: JobParameters): Boolean = false     // it repeats by itself
}
