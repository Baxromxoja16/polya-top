import { Global, Module } from '@nestjs/common';
import { Clock, IdGenerator, ObjectIdGenerator, SystemClock } from '@polya/shared-kernel';

/** Domain portlari uchun standart implementatsiyalar. Testlarda `overrideProvider` bilan almashtiriladi. */
@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: ObjectIdGenerator },
  ],
  exports: [Clock, IdGenerator],
})
export class ClockModule {}
