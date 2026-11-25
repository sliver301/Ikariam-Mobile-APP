package com.islam.ikariamtouch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlin.concurrent.thread

/** The minute alarm of [NewsChecker]; also restarts it after the phone boots or the app is updated. */
class NewsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        // the next one first: whatever happens to this check, the chain goes on
        if (intent.action == null) NewsChecker.armAlarm(app) else NewsChecker.start(app)
        val pending = goAsync()         // keeps the phone awake until the answers are in
        thread {
            try {
                NewsChecker(app).check()
            } catch (e: Exception) {
                // network trouble etc.: the next one is already set
            } finally {
                pending.finish()
            }
        }
    }
}
