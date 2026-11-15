---
"@skillcdn/console": patch
---

`console login` under an agent says the telling first, and how long the next call waits.

The call that begins a connection where no terminal shows its words ended with one sentence: tell the person the address and the code now, then run the command once more, which waits for the approval until a moment. A fresh agent started the second call first and told its person after, and read the moment, which is when the code ends, as how long that call waits, and gave it a timeout of half an hour. The words are now two lines after the address and the code:

```
Tell the person that address and that code now, in a message of its own, before you run the command again.
Then run console login --url <origin> again: it waits for the approval up to 90 seconds a call, and the code lasts until <moment>.
```

Nothing else of the command changes: the first call still ends at once with `0`, and the next still waits ninety seconds unless `--wait <seconds>` says another wait.
