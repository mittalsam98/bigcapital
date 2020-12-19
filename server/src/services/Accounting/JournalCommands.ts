import { sumBy, chain } from 'lodash';
import moment from 'moment';
import { IBill } from 'interfaces';
import JournalPoster from "./JournalPoster";
import JournalEntry from "./JournalEntry";
import { AccountTransaction } from 'models';
import {
  IInventoryTransaction,
  IManualJournal,
  IExpense,
  IExpenseCategory,
  IItem,
} from 'interfaces';

interface IInventoryCostEntity {
  date: Date,

  referenceType: string,
  referenceId: number,

  costAccount: number,
  incomeAccount: number,
  inventoryAccount: number,

  inventory: number,
  cost: number,
  income: number,
};

interface NonInventoryJEntries {
  date: Date,

  referenceType: string,
  referenceId: number,

  receivable: number,
  payable: number,

  incomeAccountId: number,
  income: number,

  costAccountId: number,
  cost: number,
};

export default class JournalCommands{
  journal: JournalPoster;

  models: any;
  repositories: any;

  /**
   * Constructor method.
   * @param {JournalPoster} journal - 
   */
  constructor(journal: JournalPoster) {
    this.journal = journal;
    
    this.repositories = this.journal.repositories;
    this.models = this.journal.models;
  }

  /**
   * Records the bill journal entries.
   * @param {IBill} bill 
   * @param {boolean} override - Override the old bill entries.
   */
  async bill(bill: IBill, override: boolean = false): Promise<void> {
    const { transactionsRepository, accountRepository } = this.repositories;
    const { Item, ItemEntry } = this.models;

    const entriesItemsIds = bill.entries.map((entry) => entry.itemId);

    // Retrieve the bill transaction items.
    const storedItems = await Item.query().whereIn('id', entriesItemsIds);

    const storedItemsMap = new Map(storedItems.map((item) => [item.id, item]));
    const payableAccount = await accountRepository.findOne({ slug: 'accounts-payable' });
    const formattedDate = moment(bill.billDate).format('YYYY-MM-DD');

    const commonJournalMeta = {
      debit: 0,
      credit: 0,
      referenceId: bill.id,
      referenceType: 'Bill',
      date: formattedDate,
      userId: bill.userId,
    };
    // Overrides the old bill entries.
    if (override) {
      const entries = await transactionsRepository.journal({
        referenceType: ['Bill'],
        referenceId: [bill.id],
      });
      this.journal.fromTransactions(entries);
      this.journal.removeEntries();
    }
    const payableEntry = new JournalEntry({
      ...commonJournalMeta,
      credit: bill.amount,
      account: payableAccount.id,
      contactId: bill.vendorId,
      contactType: 'Vendor',
      index: 1,
    });
    this.journal.credit(payableEntry);

    bill.entries.forEach((entry, index) => {
      const item: IItem = storedItemsMap.get(entry.itemId);
      const amount = ItemEntry.calcAmount(entry);

      const debitEntry = new JournalEntry({
        ...commonJournalMeta,
        debit: amount,
        account:
          ['inventory'].indexOf(item.type) !== -1
            ? item.inventoryAccountId
            : item.costAccountId,
        index: index + 2,
      });
      this.journal.debit(debitEntry);
    });
  }

  /**
   * Customer opening balance journals.
   * @param {number} customerId 
   * @param {number} openingBalance 
   */
  async customerOpeningBalance(customerId: number, openingBalance: number) {
    const { accountRepository } = this.repositories;

    const openingBalanceAccount = await accountRepository.findOne({ slug: 'opening-balance' });
    const receivableAccount = await accountRepository.findOne({ slug: 'accounts-receivable' });

    const commonEntry = {
      referenceType: 'CustomerOpeningBalance',
      referenceId: customerId,
      contactType: 'Customer',
      contactId: customerId,
    };
    const creditEntry = new JournalEntry({
      ...commonEntry,
      credit: openingBalance,
      debit: 0,
      account: openingBalanceAccount.id,
    });
    const debitEntry = new JournalEntry({
      ...commonEntry,
      credit: 0,
      debit: openingBalance,
      account: receivableAccount.id,
    });
    this.journal.debit(debitEntry);
    this.journal.credit(creditEntry);
  }

  /**
   * Vendor opening balance journals
   * @param {number} vendorId 
   * @param {number} openingBalance 
   */
  async vendorOpeningBalance(vendorId: number, openingBalance: number) {
    const { accountRepository } = this.repositories;

    const payableAccount = await accountRepository.findOne({ slug: 'accounts-payable' });
    const otherCost = await accountRepository.findOne({ slug: 'other-expenses' });

    const commonEntry = {
      referenceType: 'VendorOpeningBalance',
      referenceId: vendorId,
      contactType: 'Vendor',
      contactId: vendorId,
    };
    const creditEntry = new JournalEntry({
      ...commonEntry,
      account: payableAccount.id,
      credit: openingBalance,
      debit: 0,
    });
    const debitEntry = new JournalEntry({
      ...commonEntry,
      account: otherCost.id,
      debit: openingBalance,
      credit: 0,
    });
    this.journal.debit(debitEntry);
    this.journal.credit(creditEntry);
  }

  /**
   * Writes journal entries of expense model object.
   * @param {IExpense} expense 
   */
  expense(expense: IExpense) {
    const mixinEntry = {
      referenceType: 'Expense',
      referenceId: expense.id,
      date: expense.paymentDate,
      userId: expense.userId,
      draft: !expense.publishedAt,
    };
    const paymentJournalEntry = new JournalEntry({
      credit: expense.totalAmount,
      account: expense.paymentAccountId,
      index: 1,
      ...mixinEntry,
    });
    this.journal.credit(paymentJournalEntry);

    expense.categories.forEach((category: IExpenseCategory, index) => {
      const expenseJournalEntry = new JournalEntry({
        account: category.expenseAccountId,
        debit: category.amount,
        note: category.description,
        ...mixinEntry,
        index: index + 2,
      });
      this.journal.debit(expenseJournalEntry);
    });
  }

  /**
   * 
   * @param {number|number[]} referenceId 
   * @param {string} referenceType 
   */
  async revertJournalEntries(
    referenceId: number|number[],
    referenceType: string
  ) {
    const { AccountTransaction } = this.models;

    const transactions = await AccountTransaction.query()
      .where('reference_type', referenceType)
      .whereIn('reference_id', Array.isArray(referenceId) ? referenceId : [referenceId])
      .withGraphFetched('account.type');

    this.journal.loadEntries(transactions);
    this.journal.removeEntries();
  }


  /**
   * Writes journal entries from manual journal model object.
   * @param {IManualJournal} manualJournalObj 
   * @param {number} manualJournalId 
   */
  async manualJournal(manualJournalObj: IManualJournal, manualJournalId: number) {
    manualJournalObj.entries.forEach((entry) => {
      const jouranlEntry = new JournalEntry({
        debit: entry.debit,
        credit: entry.credit,
        account: entry.account,
        referenceType: 'Journal',
        referenceId: manualJournalId,
        contactType: entry.contactType,
        contactId: entry.contactId,
        note: entry.note,
        date: manualJournalObj.date,
        userId: manualJournalObj.userId,
        draft: !manualJournalObj.status,
        index: entry.index,
      });
      if (entry.debit) {
        this.journal.debit(jouranlEntry);
      } else {
        this.journal.credit(jouranlEntry);
      }
    });
  }

  /**
   * Removes and revert accounts balance journal entries that associated
   * to the given inventory transactions.
   * @param {IInventoryTransaction[]} inventoryTransactions 
   * @param {Journal} journal 
   */
  revertEntriesFromInventoryTransactions(inventoryTransactions: IInventoryTransaction[]) {
    const groupedInvTransactions = chain(inventoryTransactions)
      .groupBy((invTransaction: IInventoryTransaction) => invTransaction.transactionType)
      .map((groupedTrans: IInventoryTransaction[], transType: string) => [groupedTrans, transType])
      .value();

    return Promise.all(
      groupedInvTransactions.map(async (grouped: [IInventoryTransaction[], string]) => {
        const [invTransGroup, referenceType] = grouped;
        const referencesIds = invTransGroup.map((trans: IInventoryTransaction) => trans.transactionId);

        const _transactions = await AccountTransaction.tenant()
          .query()
          .where('reference_type', referenceType)
          .whereIn('reference_id', referencesIds)
          .withGraphFetched('account.type');

        if (_transactions.length > 0) {
          this.journal.loadEntries(_transactions);
          this.journal.removeEntries(_transactions.map((t: any) => t.id));
        }
      })
    );
  }

  public async nonInventoryEntries(
    transactions: NonInventoryJEntries[]
  ) {
    const receivableAccount = { id: 10 };
    const payableAccount = {id: 11};

    transactions.forEach((trans: NonInventoryJEntries) => {
      const commonEntry = {
        date: trans.date,
        referenceId: trans.referenceId,
        referenceType: trans.referenceType,
      };

      switch(trans.referenceType) {  
        case 'Bill':
          const payableEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            credit: trans.payable,
            account: payableAccount.id,            
          });
          const costEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
          });
          this.journal.credit(payableEntry);
          this.journal.debit(costEntry);
          break;
        case 'SaleInvoice':
          const receivableEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            debit: trans.receivable,
            account: receivableAccount.id,
          });
          const saleIncomeEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            credit: trans.income,
            account: trans.incomeAccountId,
          });
          this.journal.debit(receivableEntry);
          this.journal.credit(saleIncomeEntry);
          break;
      }
    });
  }

  /**
   * 
   * @param {string} referenceType -
   * @param {number} referenceId -
   * @param {ISaleInvoice[]} sales -
   */
  public async inventoryEntries(
    transactions: IInventoryCostEntity[], 
  ) {
    const receivableAccount = { id: 10 };
    const payableAccount = { id: 11 };

    transactions.forEach((sale: IInventoryCostEntity) => {
      const commonEntry = {
        date: sale.date,
        referenceId: sale.referenceId,
        referenceType: sale.referenceType,
      };
      switch(sale.referenceType) {
        case 'Bill':
          const inventoryDebit: JournalEntry = new JournalEntry({
            ...commonEntry,
            debit: sale.inventory,
            account: sale.inventoryAccount,          
          });
          const payableEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            credit: sale.inventory,
            account: payableAccount.id,
          });
          this.journal.debit(inventoryDebit);
          this.journal.credit(payableEntry);
          break;
        case 'SaleInvoice':
          const receivableEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            debit: sale.income,
            account: receivableAccount.id,
          });
          const incomeEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            credit: sale.income,
            account: sale.incomeAccount,
          });
          // Cost journal transaction.
          const costEntry: JournalEntry = new JournalEntry({
            ...commonEntry,
            debit: sale.cost,
            account: sale.costAccount,
          });
          const inventoryCredit: JournalEntry = new JournalEntry({
            ...commonEntry,
            credit: sale.cost,
            account: sale.inventoryAccount,          
          });
          this.journal.debit(receivableEntry);
          this.journal.debit(costEntry);

          this.journal.credit(incomeEntry);
          this.journal.credit(inventoryCredit);
          break;
      }
    });
  }
}